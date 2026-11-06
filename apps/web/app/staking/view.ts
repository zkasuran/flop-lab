// SPDX-License-Identifier: Apache-2.0
import { decimal } from "../../../../packages/staking/src/model";
import type { MinerCheck } from "../../../../packages/staking/src/observed";

/** Bound only the visual ratio; exact labels retain every decimal. @example barRatio("1", "2") === 0.5 */
export function barRatio(part: string, whole: string): number {
  const p = decimal(part),
    w = decimal(whole);
  if (w === 0n) return 0;
  return Number(((p > w ? w : p) * 1_000_000n) / w) / 1_000_000;
}

/** Filter without changing the recorded order or verdicts. @example filterMiners(rows, "missing", "") */
export function filterMiners(rows: readonly MinerCheck[], filter: string, query: string): MinerCheck[] {
  return rows.filter(
    (r) =>
      r.address.toLowerCase().includes(query.trim().toLowerCase()) &&
      (filter === "all" || (filter === "missing" ? r.capacityGflop === null : r.capacityGflop !== null)),
  );
}
