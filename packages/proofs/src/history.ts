// SPDX-License-Identifier: Apache-2.0
import { parseIndex, type Point } from "../../recorder/src/schema";
import { count } from "./model";

/** Read recorder counts without summing overlapping rolling windows or replacing missing points with zero.
 * @example proofHistory(index).map(point => point.proofs24h.value)
 */
export function proofHistory(value: unknown) {
  const index = parseIndex(value);
  return index.entries.map((entry) => {
    const pick = (field: string): Point => {
      const p = entry.fields[field];
      if (!p || p.value === null)
        return {
          value: null,
          measuredAt: p?.measuredAt ?? entry.measuredAt,
          source: p?.source ?? "Source unavailable in this recorder run",
        };
      return { ...p, value: count(p.value) };
    };
    return {
      snapshotId: entry.id,
      measuredAt: entry.measuredAt,
      proofs24h: pick("stats.proofs24h"),
      leaderboardRows: pick("poui.pouiLeaderboard.count"),
    };
  });
}
