// SPDX-License-Identifier: Apache-2.0
import type { Settlement } from "./devnet";

/** Compare distinct price-source addresses with a returned settlement page, not network activity.
 * @example compareSample(miners, settlements)?.ratio
 */
export function compareSample(miners: readonly string[] | null, settlements: readonly Settlement[] | null) {
  if (miners === null || settlements === null) return null;
  const addresses = [...new Set(miners)];
  const sampled = new Set(settlements.map((row) => row.miner));
  const matches = addresses.filter((address) => sampled.has(address));
  return { total: addresses.length, matches, ratio: addresses.length ? matches.length / addresses.length : 0 };
}
