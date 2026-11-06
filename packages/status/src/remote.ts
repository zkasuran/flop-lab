// SPDX-License-Identifier: Apache-2.0
import { parseHistory, type Run } from "./schema";
import { readBody } from "./probe";
export const HISTORY_URL = "https://raw.githubusercontent.com/zkasuran/flop-lab/data/status/recent.jsonl";
export type HistoryRead = {
  runs: Run[];
  mode: "data-branch" | "recorded-fixture";
  source: string;
  checkedAt: string;
  note: string;
};

/** Read the bounded public archive once. A valid empty archive stays empty. @example await readHistory(recordings) */
export async function readHistory(fallback: Run[], fetchFn: typeof fetch = fetch): Promise<HistoryRead> {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchFn(HISTORY_URL, {
      signal: controller.signal,
      redirect: "error",
      headers: { "User-Agent": "flop-lab-status/0.1" },
    });
    if (!response.ok) throw new Error(`Archive HTTP ${response.status}`);
    const runs = parseHistory(await readBody(response));
    if (runs.some((r) => Date.parse(r.finishedAt) > Date.now() + 300_000))
      throw new Error("Archive has future-dated observations");
    return {
      runs,
      mode: "data-branch",
      source: HISTORY_URL,
      checkedAt,
      note: "Last 24 archived rounds. Missing rounds are not counted as passes or failures.",
    };
  } catch {
    return {
      runs: fallback,
      mode: "recorded-fixture",
      source: "https://github.com/zkasuran/flop-lab/tree/main/packages/status/test/fixtures",
      checkedAt,
      note: "Scheduled history is unavailable. Showing bundled observations with their original dates.",
    };
  } finally {
    clearTimeout(timer);
  }
}
