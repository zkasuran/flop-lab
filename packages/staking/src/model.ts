// SPDX-License-Identifier: Apache-2.0
export interface Citation {
  source: string;
  measuredAt: string;
  quote: string;
}
export interface Parameters {
  base: string;
  coefficient: string;
  window: string;
  surgePpm: string;
  commissionCap: string;
  minerUnbonding: string;
  validatorUnbonding: string;
  validatorBaseline: string;
  validatorDowntimePercent: string;
  fraudPercent: string;
  citations: Record<string, Citation>;
}
export const UNIT = 10n ** 18n;
const MAX = (1n << 128n) - 1n;

/** Parse exact nonnegative FLOP or capacity input, with at most 18 decimals.
 * @example decimal("0.01") === 10000000000000000n
 */
export function decimal(value: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,38})(\.\d{1,18})?$/.test(value))
    throw new Error("Use a nonnegative decimal with at most 18 decimal places; no exponent notation");
  const [whole, fraction = ""] = value.split(".");
  const n = BigInt(whole!) * UNIT + BigInt(fraction.padEnd(18, "0"));
  if (n > MAX) throw new Error("Value exceeds the u128 base-unit range");
  return n;
}
/** Format base units without floating point or exponent notation.
 * @example formatFlop(10000000000000001n) === "0.010000000000000001"
 */
export function formatFlop(value: bigint): string {
  if (value < 0n) throw new Error("Negative amount");
  const fraction = (value % UNIT).toString().padStart(18, "0").replace(/0+$/, "");
  return `${value / UNIT}${fraction ? `.${fraction}` : ""}`;
}
function uint(value: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,38})$/.test(value)) throw new Error("Invalid integer parameter");
  return BigInt(value);
}
function ceil(n: bigint, d: bigint): bigint {
  return (n + d - 1n) / d;
}

/** Calculate the quoted miner exposure formula. Capacity is a user scenario, not a calibration proof.
 * @example minerStake("1", parameters).requiredFlop === "17560"
 */
export function minerStake(gflop: string, p: Parameters) {
  const capacity = decimal(gflop);
  const coefficient = decimal(p.coefficient);
  const window = uint(p.window),
    surge = uint(p.surgePpm);
  if (!window || !surge || !coefficient) throw new Error("Exposure multipliers must be positive");
  const base = decimal(p.base);
  const bond = ceil(capacity * coefficient * window * surge, UNIT * 1_000_000n);
  const required = base + bond;
  if (required > MAX) throw new Error("Required stake exceeds u128 base-unit range");
  return {
    basis: "documented scenario" as const,
    capacityGflop: formatFlop(capacity),
    baseFlop: formatFlop(base),
    capacityBondFlop: formatFlop(bond),
    requiredFlop: formatFlop(required),
    formula: `${p.base} + capacity * ${p.coefficient} * ${p.window} * ${p.surgePpm} / 1000000`,
    rounding: "Capacity bond rounded up once to one base unit (10^-18 FLOP). Runtime rounding is not verified.",
    citations: p.citations,
  };
}

/** Convert quoted unbonding blocks at a declared target cadence, not a wall-clock guarantee.
 * @example unbonding("miner", parameters).blocks === "604800"
 */
export function unbonding(role: "miner" | "validator", p: Parameters, secondsPerBlock = "1") {
  if (role !== "miner" && role !== "validator") throw new Error("Unknown role");
  const blocks = uint(role === "miner" ? p.minerUnbonding : p.validatorUnbonding);
  const seconds = decimal(secondsPerBlock);
  if (seconds === 0n) throw new Error("Block cadence must be positive");
  return {
    blocks: blocks.toString(),
    secondsAtTargetCadence: formatFlop(blocks * seconds),
    secondsPerBlock,
    citation: p.citations[role === "miner" ? "minerUnbonding" : "validatorUnbonding"],
    basis: "Target cadence only. Unlocking and withdrawal eligibility are not verified.",
  };
}

/** Check the retained legacy commission cap. This does not enable new delegation.
 * @example commission("21", parameters).withinLegacyCap === false
 */
export function commission(percent: string, p: Parameters) {
  const n = decimal(percent),
    cap = decimal(p.commissionCap);
  if (n > 100n * UNIT || cap > 100n * UNIT) throw new Error("Commission must be between 0 and 100 percent");
  return {
    percent,
    capPercent: p.commissionCap,
    withinLegacyCap: n <= cap,
    status: "legacy" as const,
    note: "D-0530 supersedes delegated staking. This cap is retained legacy state.",
  };
}

export interface Offence {
  id: string;
  label: string;
  minPercent: string | null;
  maxPercent: string | null;
  consequence: string;
  citation: Citation;
}

/** Compute a loss interval over the supplied slashable stake. Unknown rates remain unknown.
 * @example slashStake("100", fraudOffence).lossMaxFlop === "100"
 */
export function slashStake(stake: string, offence: Offence) {
  const amount = decimal(stake);
  const common = {
    offence: offence.id,
    stakeFlop: formatFlop(amount),
    consequence: offence.consequence,
    citation: offence.citation,
  };
  if (offence.minPercent === null || offence.maxPercent === null)
    return {
      ...common,
      status: "rate unspecified" as const,
      lossMinFlop: null,
      lossMaxFlop: null,
      remainingMinFlop: null,
      remainingMaxFlop: null,
    };
  const low = uint(offence.minPercent),
    high = uint(offence.maxPercent);
  if (high > 100n || low > high) throw new Error("Invalid slash interval");
  const min = (amount * low) / 100n,
    max = ceil(amount * high, 100n);
  return {
    ...common,
    status: "documented scenario" as const,
    lossMinFlop: formatFlop(min),
    lossMaxFlop: formatFlop(max),
    remainingMinFlop: formatFlop(amount - max),
    remainingMaxFlop: formatFlop(amount - min),
    rounding: "Loss bounds round outward to base units; runtime rounding and slashable balance are not verified.",
  };
}
