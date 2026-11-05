// SPDX-License-Identifier: Apache-2.0
import { parseSnapshot, object, timestamp, type Snapshot } from "../../../../packages/scoreboard/src/schema";
import { rankSnapshot } from "../../../../packages/scoreboard/src/scoring";

export const TTL_MS = 60_000;
export interface SnapshotResponse {
  snapshot: Snapshot;
  status: "observed" | "last-known";
  checkedAt: string;
  retryAt: string;
}
export interface HistoryPoint {
  measuredAt: string;
  source: string;
  prices: Record<string, string | null>;
}

/** Validate the browser response before using any observation. Example: parseResponse(await response.json()). */
export function parseResponse(input: unknown): SnapshotResponse {
  const value = object(input, "scoreboard response");
  if (value.status !== "observed" && value.status !== "last-known") throw new Error("Invalid observation status");
  return {
    snapshot: parseSnapshot(value.snapshot),
    status: value.status,
    checkedAt: timestamp(value.checkedAt, "checkedAt"),
    retryAt: timestamp(value.retryAt, "retryAt"),
  };
}

/** Extract historical raw settlement medians at the original observation time. Example: historyPoint(snapshot). */
export function historyPoint(snapshot: Snapshot): HistoryPoint {
  const record = snapshot.records.find((item) => item.kind === "settlements")!;
  return {
    measuredAt: record.measuredAt,
    source: record.source,
    prices: Object.fromEntries(
      rankSnapshot(snapshot, { now: Date.parse(snapshot.measuredAt) }).map((row) => [
        row.miner,
        row.historicalMedianPriceRaw,
      ]),
    ),
  };
}

/** Keep a bounded series of distinct observations. Example: addHistory(history, snapshot). */
export function addHistory(history: HistoryPoint[], snapshot: Snapshot): HistoryPoint[] {
  const point = historyPoint(snapshot);
  return [...history.filter((item) => item.measuredAt !== point.measuredAt), point]
    .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt))
    .slice(-12);
}

/** Scale exact decimal prices only after taking their integer difference. Example: historyGeometry(history, miner). */
export function historyGeometry(history: HistoryPoint[], miner: string) {
  const raw = history.map((point) => point.prices[miner] ?? null);
  const scale = Math.max(0, ...raw.map((value) => value?.split(".")[1]?.length ?? 0));
  const values = raw.map((value) => {
    if (value === null) return null;
    const [integer = "0", fraction = ""] = value.split(".");
    return BigInt(integer + fraction.padEnd(scale, "0"));
  });
  const present = values.filter((value) => value !== null);
  const min = present.reduce((a, b) => (a < b ? a : b), present[0] ?? 0n);
  const max = present.reduce((a, b) => (a > b ? a : b), present[0] ?? 0n);
  const start = Date.parse(history[0]?.measuredAt ?? "");
  const span = Date.parse(history.at(-1)?.measuredAt ?? "") - start;
  return history.map((point, i) => ({
    ...point,
    raw: raw[i]!,
    x: 12 + (span ? (Date.parse(point.measuredAt) - start) / span : 0.5) * 456,
    y:
      values[i] === null
        ? null
        : max === min
          ? 55
          : 90 - Number(((values[i]! - min) * 70_000_000n) / (max - min)) / 1_000_000,
  }));
}

/** Share refreshes and retain dated evidence on failure. Example: const read = snapshotStore(collect, fallback). */
export function snapshotStore(collect: () => Promise<Snapshot>, fallback: Snapshot, now = Date.now) {
  let snapshot = parseSnapshot(fallback);
  let status: SnapshotResponse["status"] = "last-known";
  let checkedAt = snapshot.measuredAt;
  let nextAttempt = 0;
  let failures = 0;
  let pending: Promise<void> | undefined;
  return async (): Promise<SnapshotResponse> => {
    if (now() >= nextAttempt) {
      pending ??= (async () => {
        try {
          snapshot = parseSnapshot(await collect());
          status = "observed";
          failures = 0;
        } catch {
          status = "last-known";
          failures++;
        } finally {
          checkedAt = new Date(now()).toISOString();
          nextAttempt = now() + Math.min(300_000, TTL_MS * 2 ** Math.min(failures, 3));
        }
      })().finally(() => {
        pending = undefined;
      });
    }
    await pending;
    return structuredClone({ snapshot, status, checkedAt, retryAt: new Date(nextAttempt).toISOString() });
  };
}
