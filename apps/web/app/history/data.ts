// SPDX-License-Identifier: Apache-2.0
import { cache } from "react";
import seedIndex from "../../../../packages/recorder/test/fixtures/seed/index.json";
import seedLast from "../../../../packages/recorder/test/fixtures/seed/snapshots/2026/11/05/21-24-20.273Z-bbf22ec5d76af626e448d855803f2e3eb1d3bd41444ce393a2927592b25c7f57.json";
import { modelMiners } from "../../../../packages/recorder/src/analysis";
import { fetchHistory, REVALIDATE_SECONDS } from "../../../../packages/recorder/src/feed";
import { object, parseIndex, parseSnapshot } from "../../../../packages/recorder/src/schema";
import type { ModelFallback } from "./fallback";

/** Public history is cached for five minutes. Absence remains explicit. Example: await publicHistory(). */
export const publicHistory = cache(() =>
  fetchHistory((url, init) => fetch(url, { ...init, next: { revalidate: REVALIDATE_SECONDS } })),
);

/** Project a checked snapshot into the home fallback. Example: await modelFallback(history). */
export async function modelFallback(history: Awaited<ReturnType<typeof publicHistory>>): Promise<ModelFallback | null> {
  const snapshot = history.latestModels ?? (await parseSnapshot(seedLast));
  const observation = snapshot.observations.models;
  if (observation.status !== "ok") return null;
  return {
    mode: history.latestModels ? "data-branch" : "recorded-fixture",
    source: observation.source,
    measuredAt: observation.measuredAt,
    snapshotId: snapshot.id,
    miners: modelMiners(snapshot),
    models: (object(observation.value).data as unknown[]).length,
  };
}

/** Use recorded real seed data only on the page, with its own label. Example: await pageHistory(). */
export async function pageHistory() {
  const history = await publicHistory();
  return {
    ...history,
    mode: history.index.entries.length ? ("data-branch" as const) : ("recorded-fixture" as const),
    index: history.index.entries.length ? history.index : parseIndex(seedIndex),
  };
}
