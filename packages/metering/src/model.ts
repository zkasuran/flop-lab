// SPDX-License-Identifier: Apache-2.0
export interface Parameters {
  minJobs: string;
  minBurst: string;
  utilizationPpm: string;
  discountPpm: string;
  lease: string;
  renewalJobs: string;
  renewalAge: string;
  recalibrationInterval: string;
  inventoryEntries: string;
  decayPpb: string;
}
const BILLION = 1_000_000_000n;
const MILLION = 1_000_000n;

/** Validate a bounded unsigned integer without passing through floating point.
 * @example uint("9007199254740993")
 */
export function uint(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,79})$/.test(value))
    throw new Error("Enter a whole unsigned decimal integer (at most 80 digits).");
  return BigInt(value);
}
function width(value: bigint, bits: 64 | 128): bigint {
  if (bits !== 64 && bits !== 128) throw new Error("Width must be 64 or 128.");
  if (value >= 1n << BigInt(bits)) throw new Error(`G_n exceeds u${bits}.`);
  return value;
}
function fraction(value: string, denominator: bigint): bigint {
  const n = uint(value);
  if (n > denominator) throw new Error("Factor exceeds one.");
  return n;
}

/** Sum declared, non-overlapping reference-work components and floor once. This does not run the execution meter.
 * @example accountWork(["600000000", "600000000"], 128).gn // "1"
 */
export function accountWork(components: readonly string[], bits: 64 | 128 = 128) {
  if (!Array.isArray(components) || components.length < 1 || components.length > 64)
    throw new Error("Declare between 1 and 64 reference-work components.");
  const fEff = components.reduce((sum, item) => sum + uint(item), 0n);
  const gn = width(fEff / BILLION, bits);
  return {
    fEff: fEff.toString(),
    gn: gn.toString(),
    remainder: (fEff % BILLION).toString(),
    bits,
    basis: "declared reference work",
  };
}

/** Apply period-relative reward weighting with one final floor. Settled G_n is unchanged.
 * @example decayWeight("1000", "900000000", "2").weightedGn // "810"
 */
export function decayWeight(gn: string, factorPpb: string, blocksSincePeriodStart: string) {
  const work = width(uint(gn), 128),
    factor = fraction(factorPpb, BILLION);
  const delta = uint(blocksSincePeriodStart),
    exponent = delta < 100n ? delta : 100n;
  return {
    settledGn: work.toString(),
    weightedGn: ((work * factor ** exponent) / BILLION ** exponent).toString(),
    exponent: exponent.toString(),
    factorPpb,
  };
}

/** Compute the declared benchmark work gate and tier cap. Passing arithmetic alone never activates a cap.
 * @example benchmark({ empirical: "213", blocks: "600", jobs: "64", verifiedGn: "64000", tier: "SOFT" }, p)
 */
export function benchmark(
  input: {
    empirical: string;
    blocks: string;
    jobs: string;
    verifiedGn: string;
    tier: "SOFT" | "HARD";
    ceiling?: string;
  },
  p: Parameters,
) {
  const empirical = uint(input.empirical),
    blocks = uint(input.blocks),
    jobs = uint(input.jobs),
    verified = uint(input.verifiedGn);
  if (input.tier !== "SOFT" && input.tier !== "HARD") throw new Error("Unknown assurance tier.");
  const required = (empirical * blocks * fraction(p.utilizationPpm, MILLION)) / MILLION;
  let effective = empirical;
  if (input.tier === "HARD") {
    if (input.ceiling === undefined) throw new Error("HARD requires a complete attested inventory ceiling.");
    const discounted = (uint(input.ceiling) * fraction(p.discountPpm, MILLION)) / MILLION;
    effective = discounted < empirical ? discounted : empirical;
  }
  return {
    requiredGn: required.toString(),
    effectiveCap: effective.toString(),
    pledgeBaseline: (effective * 86_400n).toString(),
    arithmeticPass:
      empirical > 0n && effective > 0n && blocks >= uint(p.minBurst) && jobs >= uint(p.minJobs) && verified >= required,
    unverified:
      "Credentials, correctness, capacity stake, inventory binding and initial-acceptance cooldown require runtime evidence.",
  };
}

/** Compute lease windows from a declared latest acceptance or renewal block. Grace never authorizes service.
 * @example leasePhase("1000", "605800", p).phase // "Expired: renewal grace"
 */
export function leasePhase(acceptedAt: string, atBlock: string, p: Parameters) {
  const accepted = uint(acceptedAt),
    at = uint(atBlock),
    lease = uint(p.lease);
  if (lease === 0n) throw new Error("Lease must be positive.");
  const expiry = accepted + lease,
    prunable = expiry + lease;
  const due = expiry - (lease < 86_400n ? lease : 86_400n);
  const phase =
    at < accepted
      ? "Before acceptance"
      : at >= prunable
        ? "Expired: prunable"
        : at >= expiry
          ? "Expired: renewal grace"
          : at >= due
            ? "Active: renewal due"
            : "Active";
  return {
    phase,
    serviceEligibleByTime: at >= accepted && at < expiry,
    acceptedAt,
    renewalDue: due.toString(),
    expiresAt: expiry.toString(),
    prunableAt: prunable.toString(),
    atBlock,
  };
}

/** Check renewal arithmetic and cap monotonicity. Fresh bound credentials remain a separate requirement.
 * @example renewal({ current: "1200", trigger: "1100", cap: "200", nextCap: "180", empirical: "213", nextEmpirical: "213", jobs: "8", verifiedGn: "9000" }, p)
 */
export function renewal(
  input: {
    current: string;
    trigger: string;
    cap: string;
    nextCap: string;
    empirical: string;
    nextEmpirical: string;
    jobs: string;
    verifiedGn: string;
  },
  p: Parameters,
) {
  const current = uint(input.current),
    trigger = uint(input.trigger);
  if (trigger > current) throw new Error("Renewal trigger is in the future.");
  const elapsed = current - trigger,
    cap = uint(input.cap),
    nextCap = uint(input.nextCap);
  const empirical = uint(input.empirical),
    nextEmpirical = uint(input.nextEmpirical);
  // Use the current accepted effective cap for the work gate. Do not reduce the required work by proposing a smaller cap.
  const required = (cap * (elapsed > 0n ? elapsed : 1n) * fraction(p.utilizationPpm, MILLION)) / MILLION;
  return {
    requiredGn: required.toString(),
    arithmeticPass:
      elapsed <= uint(p.renewalAge) &&
      uint(input.jobs) >= uint(p.renewalJobs) &&
      uint(input.verifiedGn) >= required &&
      nextCap > 0n &&
      nextEmpirical > 0n &&
      nextCap <= cap &&
      nextEmpirical <= empirical &&
      nextCap <= nextEmpirical,
    unverified: "Fresh one-shot credentials, unchanged host and governed HARD ceiling are not verified.",
  };
}
