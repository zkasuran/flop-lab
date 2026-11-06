// SPDX-License-Identifier: Apache-2.0
// Use recorder's browser-safe modules so Next does not trace its Node-only recording runner.
import { DATA_URL, fetchHistory, readJson } from "../../recorder/src/feed";
import { parseSnapshot } from "../../recorder/src/schema";
import { parseGateway } from "./schema";

export type PricePoint = {
  model: string;
  prompt: string | null;
  completion: string | null;
  source: string;
  measuredAt: string;
  snapshotId: string;
  labels: string[];
};
export type PriceHistory = {
  points: PricePoint[];
  checkedAt: string;
  source: string;
  errors: string[];
  truncated: boolean;
};

/** Extract model-level quotes from content-checked recorder snapshots. @example await pricePoints([snapshot]) */
export async function pricePoints(inputs: unknown[]): Promise<PricePoint[]> {
  const points: PricePoint[] = [],
    seen = new Set<string>();
  for (const input of inputs) {
    const snapshot = await parseSnapshot(input);
    if (seen.has(snapshot.id)) continue;
    seen.add(snapshot.id);
    const o = snapshot.observations.models;
    if (o.status !== "ok") continue;
    for (const model of parseGateway(o.value))
      points.push({
        model: model.registryName,
        prompt: model.prompt,
        completion: model.completion,
        source: o.source,
        measuredAt: o.measuredAt,
        snapshotId: snapshot.id,
        labels: [...new Set(model.sources.map((s) => s.label))],
      });
  }
  return points.sort((a, b) => a.measuredAt.localeCompare(b.measuredAt) || a.model.localeCompare(b.model));
}

/** Read at most eight model snapshots from the recorder data branch. Caller caches for 300 seconds. @example await loadPriceHistory() */
export async function loadPriceHistory(fetcher: typeof fetch = fetch): Promise<PriceHistory> {
  const history = await fetchHistory(fetcher),
    errors = history.error ? [history.error] : [];
  const entries = history.index.entries.filter((e) => typeof e.fields["models.count"]?.value === "number");
  const points: PricePoint[] = [];
  for (const entry of entries.slice(-8)) {
    try {
      const snapshot =
        history.latestModels?.id === entry.id
          ? history.latestModels
          : await parseSnapshot(
              await readJson(await fetcher(`${DATA_URL}${entry.path}`, { signal: AbortSignal.timeout(8000) }), 100_000),
            );
      if (snapshot.id !== entry.id || snapshot.startedAt !== entry.measuredAt)
        throw new Error("Index and snapshot disagree");
      points.push(...(await pricePoints([snapshot])));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { points, checkedAt: history.checkedAt, source: history.source, errors, truncated: entries.length > 8 };
}
