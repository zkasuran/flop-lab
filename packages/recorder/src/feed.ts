// SPDX-License-Identifier: Apache-2.0
import { parseIndex, parseSnapshot, type Index, type Snapshot } from "./schema";
export const DATA_URL = "https://raw.githubusercontent.com/zkasuran/flop-lab/data/";
export const REVALIDATE_SECONDS = 300;
export type History = {
  state: "recorded" | "empty" | "unavailable";
  source: string;
  checkedAt: string;
  error: string | null;
  index: Index;
  latestModels: Snapshot | null;
};

/** Read a bounded JSON response including its body under the caller's abort signal. @example await readJson(response, 100_000) */
export async function readJson(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`History HTTP ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty history response");
  let bytes = 0,
    raw = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error("History response exceeds byte limit");
      raw += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
  } finally {
    await reader.cancel();
  }
}

/** Load the public branch, then only the newest successful model snapshot. @example await fetchHistory() */
export async function fetchHistory(fetcher: typeof fetch = fetch): Promise<History> {
  const checkedAt = new Date().toISOString();
  let index: Index = { version: 1, entries: [] };
  const source = `${DATA_URL}index.json`;
  try {
    const response = await fetcher(source, { signal: AbortSignal.timeout(8000) });
    if (response.status === 404) {
      await response.body?.cancel();
      return { state: "empty", source, checkedAt, error: null, index, latestModels: null };
    }
    index = parseIndex(await readJson(response, 4_000_000));
    const entry = index.entries.findLast((entry) => typeof entry.fields["models.count"]?.value === "number");
    let latestModels: Snapshot | null = null;
    if (entry) {
      latestModels = await parseSnapshot(
        await readJson(await fetcher(`${DATA_URL}${entry.path}`, { signal: AbortSignal.timeout(8000) }), 100_000),
      );
      if (latestModels.id !== entry.id || latestModels.startedAt !== entry.measuredAt)
        throw new Error("Index and snapshot disagree");
    }
    return { state: index.entries.length ? "recorded" : "empty", source, checkedAt, error: null, index, latestModels };
  } catch (error) {
    return {
      state: "unavailable",
      source,
      checkedAt,
      error: error instanceof Error ? error.message : String(error),
      index,
      latestModels: null,
    };
  }
}
