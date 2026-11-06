// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { object } from "./manifest";
import { parseObservation, type Observation, type Reader } from "./trail";

const HOUR = 3_600_000;

/** Restrict reads to the exact public surfaces this tool uses. Example: allowedUrl(source). */
export function allowedUrl(source: string): URL {
  const url = new URL(source);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash)
    throw new Error("Unsafe source URL");
  const name = "[a-z0-9][a-z0-9_-]{0,47}";
  const chat =
    url.hostname === "technocore.chat" &&
    ((new RegExp(`^/kv/${name}/${name}$`).test(url.pathname) && !url.search) ||
      (new RegExp(`^/r/${name}$`).test(url.pathname) &&
        /^\?format=json&limit=100(?:&since=\d{1,16})?$/.test(url.search)));
  const github = url.hostname === "api.github.com" && url.pathname === "/search/issues";
  const build = source === "https://raw.githubusercontent.com/zkasuran/flop-lab/main/SIGNATURE.json";
  if (!chat && !github && !build) throw new Error("Source is outside the read-only allowlist");
  return url;
}

/** Persistent one-hour cache with a shared lock and rolling request budget. Example: const read = cachedReader('/tmp/flop-did-cache'). */
export function cachedReader(
  directory: string,
  options: { fetch?: typeof fetch; now?: () => number; budget?: number } = {},
): Reader {
  const request = options.fetch ?? fetch,
    now = options.now ?? Date.now;
  const budget = options.budget ?? 30;
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 30)
    throw new Error("Read budget must be 1 to 30 per hour");
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (source: string): Promise<Observation> => {
    const url = allowedUrl(source);
    await mkdir(directory, { recursive: true });
    const lockPath = join(directory, "read.lock");
    const lock = await open(lockPath, "wx").catch(() => {
      throw new Error("Another reader holds the cache lock; no request sent");
    });
    try {
      const timestamp = now();
      const file = join(directory, `${createHash("sha256").update(source).digest("hex")}.json`);
      let cached: Observation | undefined;
      try {
        cached = parseObservation(JSON.parse(await readFile(file, "utf8")));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (
        cached &&
        cached.source === source &&
        timestamp - Date.parse(cached.measuredAt) >= 0 &&
        timestamp - Date.parse(cached.measuredAt) < HOUR
      )
        return cached;
      const statePath = join(directory, "budget.json");
      let state: { reads: number[]; until: Record<string, number> } = { reads: [], until: {} };
      try {
        const saved = object(JSON.parse(await readFile(statePath, "utf8")));
        if (!Array.isArray(saved.reads) || saved.reads.some((n) => typeof n !== "number" || !Number.isFinite(n)))
          throw new Error("Invalid cache budget");
        const until = object(saved.until);
        if (Object.values(until).some((n) => typeof n !== "number" || !Number.isFinite(n)))
          throw new Error("Invalid cache backoff");
        state = { reads: saved.reads as number[], until: until as Record<string, number> };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      state.reads = state.reads.filter((n) => timestamp - n < HOUR);
      if ((state.until[url.hostname] ?? 0) > timestamp) throw new Error("Source backoff active; no request sent");
      if (url.hostname === "technocore.chat") {
        if (state.reads.length >= budget) throw new Error("Rolling technocore read budget exhausted; no request sent");
        state.reads.push(timestamp);
      }
      // Persist reservation before the request. Crashes cannot silently refund the budget.
      await writeFile(statePath, JSON.stringify(state));
      let response: Response;
      try {
        response = await request(source, {
          headers: { "User-Agent": "flop-lab-did/0.1 (read-only, cached)" },
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        state.until[url.hostname] = timestamp + 60_000;
        await writeFile(statePath, JSON.stringify(state));
        throw error;
      }
      if (response.status === 429 || response.status >= 500 || response.status === 403) {
        const retry = response.headers.get("retry-after");
        const delay =
          retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - timestamp : HOUR;
        state.until[url.hostname] = timestamp + Math.max(HOUR, Number.isFinite(delay) ? delay : HOUR);
        await writeFile(statePath, JSON.stringify(state));
      }
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      const reader = response.body?.getReader();
      if (reader)
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 200_000) {
              await reader.cancel();
              throw new Error("Response exceeds 200 KB");
            }
            chunks.push(chunk.value);
          }
        } finally {
          reader.releaseLock();
        }
      const obs = {
        source,
        measuredAt: new Date(timestamp).toISOString(),
        status: response.status,
        raw: Buffer.concat(chunks).toString("utf8"),
      };
      await writeFile(`${file}.tmp`, JSON.stringify(obs));
      await rename(`${file}.tmp`, file);
      return obs;
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  };
  return (source) => {
    const next = queue.then(() => read(source));
    queue = next.catch(() => undefined);
    return next;
  };
}
