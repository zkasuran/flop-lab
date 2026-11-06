// SPDX-License-Identifier: Apache-2.0
import { parseCommit, parseCommits, type Revision } from "./spec";
import { evidence, object, sha, text, type Recording, type Gap } from "./model";

export const npmPackages = ["client", "contracts", "sdk", "cli", "pi"];
export const docsPages = ["sdk-references", "protocol-parameters", "agent-integration"];
export type Capture = {
  revisions: Revision[];
  releases: Recording[];
  docs: Recording[];
  raw: Recording[];
  gaps: Gap[];
  requests: number;
  durationMs: number;
};
export type Reader = { get: (url: string) => Promise<Recording>; requests: number };

/** Bounded sequential public reads with a 15 minute cache and capped retry backoff. @example createReader().get(url) */
export function createReader(
  options: {
    fetch?: typeof fetch;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    maxRequests?: number;
  } = {},
): Reader {
  const transport = options.fetch ?? fetch,
    now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const cache = new Map<string, { until: number; record: Recording }>();
  let previous = 0;
  const reader: Reader = {
    requests: 0,
    async get(source) {
      const url = new URL(source);
      if (
        url.protocol !== "https:" ||
        ![
          "api.github.com",
          "raw.githubusercontent.com",
          "registry.npmjs.org",
          "pypi.org",
          "docs.flop.network",
        ].includes(url.hostname) ||
        url.username ||
        url.password
      )
        throw new Error("Unsupported public source");
      const hit = cache.get(source);
      if (hit && hit.until > now()) return hit.record;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (reader.requests >= (options.maxRequests ?? 50)) throw new Error("Request ceiling reached");
        await sleep(Math.max(0, 500 - (now() - previous)));
        reader.requests++;
        previous = now();
        const response = await transport(source, {
          headers: {
            "user-agent": "flop-lab-upgrades/0.1 public-history",
            accept: "application/json, text/plain, text/html",
          },
          signal: AbortSignal.timeout(20_000),
          redirect: "error",
          credentials: "omit",
        });
        let body = "",
          bytes = 0;
        const stream = response.body?.getReader(),
          decoder = new TextDecoder();
        if (stream) {
          try {
            while (true) {
              const part = await stream.read();
              if (part.done) break;
              bytes += part.value.byteLength;
              if (bytes > 4_000_000) {
                await stream.cancel();
                throw new Error("Response exceeds byte limit");
              }
              body += decoder.decode(part.value, { stream: true });
            }
            body += decoder.decode();
          } finally {
            stream.releaseLock();
          }
        }
        const record = {
          source,
          status: response.status,
          measuredAt: new Date(now()).toISOString(),
          body,
          lastModified: response.headers.get("last-modified"),
        };
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          const retry = response.headers.get("retry-after");
          const ms = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - now() : 0;
          if (ms > 10_000) return record;
          await sleep(Math.max(500 * 2 ** attempt, Number.isFinite(ms) ? ms : 0));
          continue;
        }
        if (response.ok) cache.set(source, { until: now() + 900_000, record });
        return record;
      }
      throw new Error("Retry exhausted");
    },
  };
  const get = reader.get;
  let queue: Promise<void> = Promise.resolve();
  reader.get = (source) => {
    const operation = queue.then(() => get(source));
    queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
  return reader;
}

/** Capture a bounded history window or an explicit pair of immutable commits. @example await capture({ from, to }) */
export async function capture(options: { from?: string; to?: string; reader?: Reader } = {}): Promise<Capture> {
  if (Boolean(options.from) !== Boolean(options.to)) throw new Error("Use --from and --to together");
  if (options.from) sha(options.from);
  if (options.to) sha(options.to);
  const reader = options.reader ?? createReader(),
    start = performance.now();
  const initialRequests = reader.requests;
  const raw: Recording[] = [],
    gaps: Gap[] = [],
    revisions: Revision[] = [],
    releases: Recording[] = [],
    docs: Recording[] = [];
  const get = async (url: string) => {
    const r = await reader.get(url);
    raw.push(r);
    return r;
  };
  const fail = (kind: Gap["kind"], source: string, error: unknown) =>
    gaps.push({
      kind,
      source,
      measuredAt: new Date().toISOString(),
      reason: error instanceof Error ? error.message : "Source unavailable",
    });
  const commitsUrl = "https://api.github.com/repos/flop-labs/yellowpaper/commits?path=yellowpaper.md&per_page=3";
  try {
    const commits = [];
    if (options.from && options.to) {
      for (const id of [options.from, options.to]) {
        const r = await get(`https://api.github.com/repos/flop-labs/yellowpaper/commits/${id}`);
        if (r.status !== 200) throw new Error(`Commit HTTP ${r.status}`);
        commits.push(parseCommit(JSON.parse(r.body)));
      }
    } else {
      const r = await get(commitsUrl);
      if (r.status !== 200) throw new Error(`Commit history HTTP ${r.status}`);
      commits.push(...parseCommits(JSON.parse(r.body)).reverse());
    }
    const paths = new Set(["yellowpaper.md", "CHANGELOG.md"]);
    if (commits.length < 2) {
      const observation = raw.at(-1)!;
      gaps.push({
        ...evidence(observation),
        kind: "spec",
        reason: "Fewer than two dated revisions. No spec comparison is available.",
      });
    }
    if (commits.length > 1) {
      const r = await get(
        `https://api.github.com/repos/flop-labs/yellowpaper/compare/${commits[0]!.sha}...${commits.at(-1)!.sha}`,
      );
      if (r.status === 200) {
        const data = object(JSON.parse(r.body));
        if (!Array.isArray(data.files)) throw new Error("Invalid comparison files");
        if (data.files.length >= 300)
          gaps.push({
            ...evidence(r),
            kind: "spec",
            reason: "GitHub comparison file list reached its cap. Decision history can be incomplete.",
          });
        const decisions = data.files
          .map((f) => text(object(f).filename))
          .filter((p) => /^decisions\/[a-zA-Z0-9._-]+\.md$/.test(p));
        decisions.slice(0, 8).forEach((p) => paths.add(p));
        if (decisions.length > 8)
          gaps.push({
            ...evidence(r),
            kind: "spec",
            reason: "Only the first eight changed decision files were fetched.",
          });
      } else gaps.push({ ...evidence(r), kind: "spec", reason: `Decision file discovery HTTP ${r.status}` });
    }
    for (const commit of commits) {
      const files: Record<string, Recording> = {};
      for (const path of paths)
        files[path] = await get(`https://raw.githubusercontent.com/flop-labs/yellowpaper/${commit.sha}/${path}`);
      revisions.push({ commit, files });
    }
  } catch (error) {
    fail("spec", commitsUrl, error);
  }
  for (const name of npmPackages) {
    const url = `https://registry.npmjs.org/@flop-labs/${name}`;
    try {
      releases.push(await get(url));
    } catch (error) {
      fail("sdk", url, error);
    }
  }
  const python = "https://pypi.org/pypi/flop-sdk/json";
  try {
    releases.push(await get(python));
  } catch (error) {
    fail("sdk", python, error);
  }
  for (const name of docsPages) {
    const url = `https://docs.flop.network/docs/${name}`;
    try {
      docs.push(await get(url));
    } catch (error) {
      fail("docs", url, error);
    }
  }
  return {
    revisions,
    releases,
    docs,
    raw,
    gaps,
    requests: reader.requests - initialRequests,
    durationMs: performance.now() - start,
  };
}
