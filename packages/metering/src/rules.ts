// SPDX-License-Identifier: Apache-2.0
import parameterRecord from "../fixtures/parameters.json";
import section4 from "../fixtures/section-4.json";
import section7 from "../fixtures/section-7.json";
import type { Parameters } from "./model";
const names: Record<keyof Parameters, string> = {
  minJobs: "calibration_min_verified_jobs",
  minBurst: "calibration_min_burst_blocks",
  utilizationPpm: "calibration_min_utilization_ppm",
  discountPpm: "calibration_provisional_discount_ppm",
  lease: "calibration_lease_blocks",
  renewalJobs: "calibration_renewal_min_verified_jobs",
  renewalAge: "calibration_renewal_max_age_blocks",
  recalibrationInterval: "calibration_min_recalibration_interval_blocks",
  inventoryEntries: "calibration_max_gpu_inventory_entries",
  decayPpb: "gn_decay_factor_ppb",
};
/** Parse the pinned parameter subset, rejecting absent or duplicate numeric definitions.
 * @example parseParameters(parameterRecord.raw)
 */
export function parseParameters(raw: string): Parameters {
  const values: Partial<Parameters> = {};
  for (const [key, name] of Object.entries(names)) {
    const blocks = raw.split(/(?=^ {2}- name: )/m).filter((b) => b.startsWith(`  - name: ${name}\n`));
    const match = blocks[0]?.match(/^ {4}value: ([0-9][0-9_]*)$/m);
    if (blocks.length !== 1 || !match) throw new Error(`Missing or ambiguous parameter ${name}`);
    values[key as keyof Parameters] = BigInt(match[1]!.replaceAll("_", "")).toString();
  }
  return values as Parameters;
}
export const parameters = parseParameters(parameterRecord.raw);
export const rules = [section4, section7, parameterRecord].map((r) => ({
  source: r.source,
  measuredAt: r.measuredAt,
  pin: r.pin,
  quote: r.raw.replace(/[\u2013\u2014]/g, "-"),
}));
