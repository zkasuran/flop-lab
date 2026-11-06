// SPDX-License-Identifier: Apache-2.0
import type { Miner } from "../../../../packages/metering/src/observed";
import { uint } from "../../../../packages/metering/src/model";

/** Bounded visual ratio; exact values remain visible beside the bar.
 * @example ratio("1", "2") // 0.5
 */
export function ratio(part: string, total: string): number {
  const a = uint(part),
    b = uint(total);
  if (b === 0n) return 0;
  return Number(((a >= b ? b : a) * 10000n) / b) / 10000;
}
/** Filter dated miner rows without treating an indexed phase as lease validity.
 * @example filterMiners(rows, "missing", "5D")
 */
export function filterMiners(rows: Miner[], filter: string, query: string): Miner[] {
  return rows.filter(
    (r) =>
      (filter === "all" || (filter === "missing" ? r.gnMax === null : r.gnMax !== null)) &&
      r.address.toLowerCase().includes(query.toLowerCase().trim()),
  );
}
