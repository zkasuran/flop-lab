// SPDX-License-Identifier: Apache-2.0
import { array, integer, object, text } from "./validation";
import type { Status } from "./types";

export const HISTORY_URL = "https://raw.githubusercontent.com/zkasuran/flop-lab/data/index.json";
export interface HistoryClaim {
  id: string;
  status: Status;
  measuredAt: string;
  source: string;
  reason: string;
}
export interface HistoryRun {
  id: string;
  measuredAt: string;
  claims: HistoryClaim[];
}
export interface ClaimHistory {
  state: "recorded" | "empty" | "unavailable";
  source: string;
  checkedAt: string;
  error: string | null;
  runs: HistoryRun[];
}

function timestamp(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result)
    throw new Error("Invalid history time");
  return result;
}

/** Read only the recorder's dated claim projection; missing claims remain missing. @example parseClaimHistory(index) */
export function parseClaimHistory(value: unknown): HistoryRun[] {
  const index = object(value);
  if (integer(index.version) !== 1) throw new Error("Unsupported history version");
  const entries = array(index.entries);
  if (entries.length > 366) throw new Error("History entry limit exceeded");
  const ids = new Set<string>();
  return entries
    .map((entry) => {
      const run = object(entry);
      const id = text(run.id);
      if (!/^[a-f0-9]{64}$/.test(id) || ids.has(id)) throw new Error("Invalid or duplicate history run");
      ids.add(id);
      const seen = new Set<string>();
      const claims = array(run.claims);
      if (claims.length > 1000) throw new Error("History claim limit exceeded");
      return {
        id,
        measuredAt: timestamp(run.measuredAt),
        claims: claims.map((value) => {
          const c = object(value);
          const claimId = text(c.id);
          if (!/^[a-z][a-z0-9-]{0,99}$/.test(claimId) || seen.has(claimId))
            throw new Error("Invalid or duplicate historical claim");
          seen.add(claimId);
          if (!["PASS", "FAIL", "UNVERIFIABLE", "SKIPPED"].includes(text(c.status)))
            throw new Error("Invalid claim status");
          const source = text(c.source);
          const reason = text(c.reason);
          if (!source.startsWith("https://") || source.length > 2000 || reason.length > 4000)
            throw new Error("Invalid history provenance");
          return { id: claimId, status: c.status as Status, measuredAt: timestamp(c.measuredAt), source, reason };
        }),
      };
    })
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt) || a.id.localeCompare(b.id));
}

/** Keep one point per run, including explicit gaps rather than carrying a pass forward. @example claimTimeline(runs, "gateway-contract") */
export function claimTimeline(runs: HistoryRun[], id: string) {
  return runs.map((run) => ({
    run: run.id,
    recordedAt: run.measuredAt,
    claim: run.claims.find((claim) => claim.id === id) ?? null,
  }));
}

/** Fetch the bounded recorder index once. No branch or invalid data is a visible state. @example await fetchClaimHistory() */
export async function fetchClaimHistory(fetcher: typeof fetch = fetch): Promise<ClaimHistory> {
  const base = { source: HISTORY_URL, checkedAt: new Date().toISOString() };
  try {
    const response = await fetcher(HISTORY_URL, { signal: AbortSignal.timeout(8000), redirect: "error" });
    if (response.status === 404) {
      await response.body?.cancel();
      return { ...base, state: "empty", error: null, runs: [] };
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`History HTTP ${response.status}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty history body");
    const decoder = new TextDecoder();
    let size = 0,
      raw = "";
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 4_000_000) throw new Error("History byte limit exceeded");
        raw += decoder.decode(next.value, { stream: true });
      }
    } finally {
      await reader.cancel();
    }
    const runs = parseClaimHistory(JSON.parse(raw + decoder.decode()));
    return { ...base, state: runs.length ? "recorded" : "empty", error: null, runs };
  } catch (error) {
    return { ...base, state: "unavailable", error: error instanceof Error ? error.message : String(error), runs: [] };
  }
}
