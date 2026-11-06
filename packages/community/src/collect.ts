// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, rename, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  count,
  object,
  parseSnapshot,
  projectComments,
  projectIssue,
  repositories,
  timestamp,
  type ChatSample,
  type RepoSample,
  type Snapshot,
} from "./model.js";

export const cacheTtlMs = 6 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
export type CollectOptions = {
  cacheDir: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};
type ResponseData = {
  status: number | null;
  text: string | null;
  measuredAt: string;
  hasMore: boolean;
  error: string | null;
};

/** Parse only the server's room-count header. Sequence counters are not messages. @example parseRooms("# 2 of 9 rooms (cap 100, 1M of 2M stored), newest first").rooms */
export function parseRooms(body: string): { rooms: number; raw: string } {
  const line = body.split(/\r?\n/, 1)[0] ?? "";
  const match = /^# (\d+) of (\d+) rooms \(cap \d+, [\d.]+[KMG]? of [\d.]+[KMG]? stored\), newest first$/.exec(line);
  if (!match || Number(match[1]) > Number(match[2])) throw new Error("Unknown rooms format");
  return { rooms: count(Number(match[2])), raw: line };
}

async function optionalJson(path: string): Promise<unknown | null> {
  try {
    const body = await readFile(path, "utf8");
    if (body.length > 2_000_000) throw new Error("Cache too large");
    return JSON.parse(body) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Unreadable cache or budget state", { cause: error });
  }
}
async function atomic(path: string, data: unknown): Promise<void> {
  await writeFile(`${path}.tmp`, `${JSON.stringify(data)}\n`, { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}

/** Collect bounded public metadata with a persistent six-hour cache and rolling chat budget. @example await collectCommunity({cacheDir:".cache/community"}) */
export async function collectCommunity(
  options: CollectOptions,
): Promise<{ snapshot: Snapshot; cached: boolean; requests: number }> {
  const now = options.now ?? Date.now,
    fetcher = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  await mkdir(options.cacheDir, { recursive: true, mode: 0o700 });
  const lock = join(options.cacheDir, "lock");
  try {
    await mkdir(lock);
  } catch {
    throw new Error("Collector locked. Another process is active or its lock needs manual inspection.");
  }
  try {
    const cachePath = join(options.cacheDir, "snapshot.json"),
      budgetPath = join(options.cacheDir, "chat-budget.json");
    const stored = await optionalJson(cachePath);
    if (stored !== null) {
      const snapshot = parseSnapshot(stored),
        elapsed = now() - Date.parse(snapshot.startedAt);
      if (elapsed < 0) throw new Error("Clock precedes cached observation");
      if (elapsed < cacheTtlMs) return { snapshot, cached: true, requests: 0 };
    }
    const rawBudget = await optionalJson(budgetPath);
    if (rawBudget !== null && (!Array.isArray(rawBudget) || rawBudget.length > 20))
      throw new Error("Invalid chat budget");
    const budget: number[] = (rawBudget === null ? [] : (rawBudget as unknown[])).map((v) => Date.parse(timestamp(v)));
    if (budget.some((t) => t > now())) throw new Error("Clock precedes chat budget");
    let active = budget.filter((t) => now() - t < dayMs),
      requests = 0,
      githubRequests = 0;
    const startedAt = new Date(now()).toISOString();
    const request = async (url: string, chat: boolean): Promise<ResponseData> => {
      const failed = (error: string, status: number | null = null): ResponseData => ({
        status,
        text: null,
        measuredAt: new Date(now()).toISOString(),
        hasMore: false,
        error,
      });
      for (let attempt = 0; attempt < (chat ? 1 : 2); attempt++) {
        if (chat) {
          active = active.filter((t) => now() - t < dayMs);
          if (active.length >= 20) return failed("Rolling-day request budget exhausted");
          active.push(now());
          await atomic(
            budgetPath,
            active.map((t) => new Date(t).toISOString()),
          );
        } else if (githubRequests >= 56) return failed("GitHub collection request budget exhausted");
        await sleep(requests ? 250 : 0);
        requests++;
        if (!chat) githubRequests++;
        try {
          const response = await fetcher(url, {
            headers: {
              "User-Agent": "flop-lab-community/0.1 (public metadata only)",
              Accept: chat ? "text/plain" : "application/vnd.github+json",
            },
            signal: AbortSignal.timeout(12000),
            redirect: "error",
          });
          const measuredAt = new Date(now()).toISOString();
          if (!response.ok) {
            await response.body?.cancel();
            if (!chat && attempt === 0 && (response.status === 429 || response.status >= 500)) {
              const delay = Number(response.headers.get("retry-after") ?? 1);
              // Never retry earlier than Retry-After. Long or date-form delays stop this bounded run.
              if (!Number.isFinite(delay) || delay < 0 || delay > 5)
                return failed(`HTTP ${response.status}; retry deferred`, response.status);
              await sleep(Math.max(1000, delay * 1000));
              continue;
            }
            return failed(`HTTP ${response.status}`, response.status);
          }
          let body = "",
            bytes = 0;
          const reader = response.body?.getReader(),
            decoder = new TextDecoder();
          if (!reader) return failed("Empty response", response.status);
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 2_000_000) {
              await reader.cancel();
              return failed("Response too large", response.status);
            }
            body += decoder.decode(chunk.value, { stream: true });
          }
          body += decoder.decode();
          return {
            status: response.status,
            text: body,
            measuredAt,
            hasMore: /rel="next"/.test(response.headers.get("link") ?? ""),
            error: null,
          };
        } catch {
          return failed("Network request failed");
        }
      }
      return failed("Retry budget exhausted");
    };
    const repos: RepoSample[] = [];
    for (const repo of repositories) {
      const source = `https://api.github.com/repos/flop-labs/${repo}/issues?state=all&sort=created&direction=desc&per_page=25`;
      const response = await request(source, false);
      const sample: RepoSample = {
        repo,
        source,
        measuredAt: response.measuredAt,
        status: response.status,
        hasMore: response.hasMore,
        error: response.error,
        items: [],
      };
      if (response.text !== null) {
        try {
          const raw: unknown = JSON.parse(response.text);
          if (!Array.isArray(raw) || raw.length > 25) throw new Error("Invalid issue list");
          sample.items = raw.map(projectIssue);
          let commentRequests = 0;
          for (let i = 0; i < sample.items.length; i++) {
            const item = sample.items[i]!;
            if (!item.comments) continue;
            // Reserve room for every repository. Busy threads must not consume the whole run.
            if (commentRequests >= 10) continue;
            commentRequests++;
            const comments = await request(
              `https://api.github.com/repos/flop-labs/${repo}/issues/${item.number}/comments?per_page=100&page=1`,
              false,
            );
            item.commentsMeasuredAt = comments.measuredAt;
            if (comments.text === null) continue;
            try {
              const user = object(raw[i]).user;
              const authorId = user === null ? null : count(object(user).id);
              item.responses = projectComments(JSON.parse(comments.text) as unknown, authorId);
              item.commentsComplete = !comments.hasMore && item.responses.length >= item.comments;
            } catch {
              item.responses = [];
              item.commentsComplete = false;
            }
          }
        } catch {
          sample.items = [];
          sample.error = "Invalid issue response";
        }
      }
      repos.push(sample);
    }
    const chat: ChatSample[] = [];
    for (const path of ["stats", "rooms"]) {
      const source = `https://technocore.chat/${path}`,
        response = await request(source, true);
      const entry: ChatSample = {
        source,
        measuredAt: response.measuredAt,
        status: response.status,
        rooms: null,
        messages: null,
        raw: null,
        error: response.error,
      };
      if (response.text !== null) {
        try {
          if (path === "rooms") Object.assign(entry, parseRooms(response.text));
          else entry.error = "No verified message-count schema for this endpoint";
        } catch {
          entry.error = "Unrecognized room-count response";
        }
      }
      chat.push(entry);
    }
    const snapshot = parseSnapshot({
      version: 1,
      startedAt,
      measuredAt: new Date(now()).toISOString(),
      requests,
      sampleLimit: 25,
      repos,
      chat,
    });
    await atomic(cachePath, snapshot);
    return { snapshot, cached: false, requests };
  } finally {
    await rmdir(lock);
  }
}
