// SPDX-License-Identifier: Apache-2.0
import type { Snapshot as HomeSnapshot } from "../../lib/devnet";
import { count, object, text, time } from "../../../../packages/recorder/src/schema";

export type ModelFallback = {
  mode: "data-branch" | "recorded-fixture";
  measuredAt: string;
  source: string;
  snapshotId: string;
  miners: string[];
  models: number;
};

/** Validate the same-origin API model projection. Example: parseFallback(payload.modelFallback). */
export function parseFallback(value: unknown): ModelFallback | null {
  if (value === null) return null;
  const o = object(value);
  if (o.mode !== "data-branch" && o.mode !== "recorded-fixture") throw new Error("Invalid recording mode");
  if (
    !Array.isArray(o.miners) ||
    o.miners.length > 1000 ||
    o.miners.some((miner) => typeof miner !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{46,50}$/.test(miner))
  )
    throw new Error("Invalid recorded miners");
  return {
    mode: o.mode,
    measuredAt: time(o.measuredAt),
    source: text(o.source),
    snapshotId: text(o.snapshotId, 64),
    miners: o.miners as string[],
    models: count(o.models),
  };
}

/** Replace only a failed or missing live listing with a newer recording. Example: withRecording(snapshot, fallback). */
export function withRecording(snapshot: HomeSnapshot, recording: ModelFallback | null): HomeSnapshot {
  if (!recording || (!snapshot.miners.stale && snapshot.miners.value !== null)) return snapshot;
  if (snapshot.miners.measuredAt && recording.measuredAt <= snapshot.miners.measuredAt) return snapshot;
  return {
    ...snapshot,
    miners: {
      value: recording.miners,
      measuredAt: recording.measuredAt,
      stale: true,
      error: snapshot.miners.error,
      source: `Recorded snapshot (${recording.mode}); ${recording.models} models; ${recording.source}; ${recording.snapshotId}`,
    },
  };
}

let cached: Promise<ModelFallback | null> | undefined;
let until = 0;
/** Coalesce the home panels' fallback reads for five minutes. Example: await recordedModels(). */
export function recordedModels(): Promise<ModelFallback | null> {
  if (!cached || Date.now() >= until) {
    until = Date.now() + 300_000;
    cached = fetch("/history/models.json", { signal: AbortSignal.timeout(10_000) })
      .then(async (response) => {
        if (!response.ok) throw new Error(`History HTTP ${response.status}`);
        // The feed has a bounded server-side index. Validate its model projection independently.
        return parseFallback(object(await response.json()).modelFallback);
      })
      .catch(() => null);
  }
  return cached;
}
