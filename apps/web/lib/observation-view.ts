// SPDX-License-Identifier: Apache-2.0
import type { Observation, Settlement } from "./devnet";

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

/** Describe the age of a measurement against the browser clock. @example age(observation.measuredAt, Date.now()) */
export function age(at: string | null, now: number): string {
  if (!at) return "not measured";
  const seconds = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  return seconds < 60
    ? `${seconds}s old`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m old`
      : `${Math.floor(seconds / 3600)}h old`;
}

/** A value is last known when its source failed, it was never measured or it is older than a minute. @example isStale(snapshot.stats, Date.now()) */
export function isStale(observation: Observation<unknown>, now: number): boolean {
  return observation.stale || !observation.measuredAt || now - Date.parse(observation.measuredAt) > 60_000;
}
