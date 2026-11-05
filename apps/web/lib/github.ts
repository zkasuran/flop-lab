// SPDX-License-Identifier: Apache-2.0
import { parsePullRequests, type PullRequest } from "./provenance";
export const GITHUB_TTL = 300_000;
export const GITHUB_API = "https://api.github.com/repos/zkasuran/flop-lab/pulls";
export type PullPage = {
  prs: PullRequest[];
  measuredAt: string;
  source: string;
  next: boolean;
  stale: boolean;
  note: string | null;
};
const memory = new Map<number, PullPage>();
const pending = new Map<number, Promise<PullPage>>();
let blockedUntil = 0;

/** Read one cached public GitHub page. No tokens and no automatic retries. Example: await getPullPage(1). */
export async function getPullPage(page: number, now = Date.now()): Promise<PullPage> {
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error("Invalid page number");
  const key = `flop-prs-v1-${page}`;
  let cached = memory.get(page);
  try {
    blockedUntil = Math.max(blockedUntil, Number(sessionStorage.getItem("flop-github-retry") ?? 0) || 0);
    const raw = sessionStorage.getItem(key);
    if (!cached && raw && raw.length < 2_000_000) {
      const stored = JSON.parse(raw) as PullPage;
      if (
        typeof stored.measuredAt === "string" &&
        Number.isFinite(Date.parse(stored.measuredAt)) &&
        typeof stored.next === "boolean"
      )
        cached = {
          ...stored,
          prs: parsePullRequests(stored.prs),
          source: `${GITHUB_API}?state=all&sort=created&direction=desc&per_page=30&page=${page}`,
          stale: false,
          note: null,
        };
    }
  } catch {
    /* Storage is optional. Invalid cache entries are ignored. */
  }
  const age = cached ? now - Date.parse(cached.measuredAt) : Infinity;
  if (cached && age >= 0 && age < GITHUB_TTL) return cached;
  if (now < blockedUntil) {
    const note = `GitHub requests paused until ${new Date(blockedUntil).toISOString()}.`;
    if (cached) return { ...cached, stale: true, note };
    throw new Error(note);
  }
  const existing = pending.get(page);
  if (existing) return existing;
  const source = `${GITHUB_API}?state=all&sort=created&direction=desc&per_page=30&page=${page}`;
  const request = (async () => {
    try {
      const response = await fetch(source, {
        headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        if (response.status === 403 || response.status === 429 || response.status >= 500) {
          const retry = response.headers.get("retry-after");
          const retryAt = retry && /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry ?? "");
          const resetAt = Number(response.headers.get("x-ratelimit-reset")) * 1000;
          blockedUntil = Math.max(
            now + 60_000,
            Number.isFinite(retryAt) ? retryAt : 0,
            Number.isFinite(resetAt) ? resetAt : 0,
          );
          try {
            sessionStorage.setItem("flop-github-retry", String(blockedUntil));
          } catch {
            /* Optional. */
          }
        }
        throw new Error(
          `GitHub HTTP ${response.status}${blockedUntil > now ? `. Requests paused until ${new Date(blockedUntil).toISOString()}` : ""}`,
        );
      }
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error("GitHub response exceeds the page size limit");
      const result: PullPage = {
        prs: parsePullRequests(JSON.parse(text)),
        measuredAt: new Date(now).toISOString(),
        source,
        next: /rel="next"/.test(response.headers.get("link") ?? ""),
        stale: false,
        note: null,
      };
      memory.set(page, result);
      try {
        sessionStorage.setItem(key, JSON.stringify(result));
      } catch {
        /* Optional. */
      }
      return result;
    } catch (cause) {
      const note = cause instanceof Error ? cause.message : "GitHub unavailable";
      if (cached) return { ...cached, stale: true, note };
      throw new Error(note, { cause });
    } finally {
      pending.delete(page);
    }
  })();
  pending.set(page, request);
  return request;
}
