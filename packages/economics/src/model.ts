// SPDX-License-Identifier: Apache-2.0
export const UNIT = 10n ** 18n;
export const SPEC = {
  sha: "2a2cc8218048a2933071bb2f45d75335560e39d8",
  source: "https://github.com/flop-labs/yellowpaper/blob/2a2cc8218048a2933071bb2f45d75335560e39d8/yellowpaper.md",
  genesis: 4_400_000_000n * UNIT,
  initialReward: 96n * UNIT,
  halvingInterval: 63_072_000n,
  maxHalvings: 5n,
  floorReward: 3n * UNIT,
  subsidyPerRecipient: 8n * UNIT,
  subsidyEnd: 315_360_000n,
  rewardShares: { miners: 750n, validators: 100n, agents: 100n, stakers: 50n },
  feeMinerPpt: 850n,
  feeValidatorPpt: 150n,
  auditPpm: 10_000n,
} as const;

function nonnegative(value: bigint): bigint {
  if (typeof value !== "bigint" || value < 0n) throw new Error("Expected a nonnegative bigint");
  return value;
}

/** Parse a bounded unsigned integer without numeric coercion. @example integer("63072000") */
export function integer(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,77})$/.test(value)) throw new Error("Expected an unsigned integer of at most 78 digits");
  return BigInt(value);
}

/** Parse FLOP into exact base units. No exponent or rounding. @example parseFlop("0.5") */
export function parseFlop(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,59})(\.[0-9]{1,18})?$/.test(value))
    throw new Error("Expected FLOP with at most 18 decimal places");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * UNIT + BigInt(fraction.padEnd(18, "0"));
}

/** Format exact base units without floating point. @example formatFlop(UNIT / 2n) // "0.5" */
export function formatFlop(value: bigint): string {
  nonnegative(value);
  const fraction = (value % UNIT).toString().padStart(18, "0").replace(/0+$/, "");
  return `${value / UNIT}${fraction ? `.${fraction}` : ""}`;
}

/** R9.2 and R9.7: block zero is unrewarded; floor after five halvings. @example rewardAt(0n) // 0n */
export function rewardAt(block: bigint): bigint {
  nonnegative(block);
  if (block === 0n) return 0n;
  const era = block / SPEC.halvingInterval;
  return era >= SPEC.maxHalvings ? SPEC.floorReward : SPEC.initialReward / 2n ** era;
}

/** R9.3: subsidy to each recipient, with an exclusive sunset. @example subsidyAt(315360000n) // 0n */
export function subsidyAt(block: bigint): bigint {
  nonnegative(block);
  return block === 0n || block >= SPEC.subsidyEnd
    ? 0n
    : SPEC.subsidyPerRecipient / 2n ** (block / SPEC.halvingInterval);
}

/** Gross scheduled supply through block N, inclusive. No net-supply claim. @example supplyAt(1n).gross */
export function supplyAt(block: bigint) {
  nonnegative(block);
  let emission = 0n;
  let subsidy = 0n;
  for (let era = 0n; era < SPEC.maxHalvings; era++) {
    const start = era === 0n ? 1n : era * SPEC.halvingInterval;
    const end = (era + 1n) * SPEC.halvingInterval - 1n;
    const last = block < end ? block : end;
    if (last >= start) {
      const count = last - start + 1n;
      emission += count * (SPEC.initialReward / 2n ** era);
      subsidy += count * 2n * (SPEC.subsidyPerRecipient / 2n ** era);
    }
  }
  if (block >= SPEC.subsidyEnd) emission += (block - SPEC.subsidyEnd + 1n) * SPEC.floorReward;
  return { genesis: SPEC.genesis, emission, subsidy, gross: SPEC.genesis + emission + subsidy };
}

/** R9 four-way reward pool split. Each scheduled reward divides exactly. @example rewardSplit(1n).miners */
export function rewardSplit(block: bigint) {
  const reward = rewardAt(block);
  return {
    miners: (reward * SPEC.rewardShares.miners) / 1000n,
    validators: (reward * SPEC.rewardShares.validators) / 1000n,
    agents: (reward * SPEC.rewardShares.agents) / 1000n,
    stakers: (reward * SPEC.rewardShares.stakers) / 1000n,
  };
}

/**
 * R12.1a and Appendix D: successful gross payable, separate inclusion fee and tip.
 * Floor each rational leg in base units and expose unspecified allocation dust.
 * Audit is 1% of payable, deducted from the 15% validator pool (Appendix A).
 * @example paymentSplit(parseFlop("100")).audit // 1 FLOP in base units
 */
export function paymentSplit(payable: bigint, inclusionFee = 0n, tip = 0n) {
  nonnegative(payable);
  nonnegative(inclusionFee);
  nonnegative(tip);
  const miner = (payable * SPEC.feeMinerPpt) / 1000n;
  const validatorPool = (payable * SPEC.feeValidatorPpt) / 1000n;
  const audit = (payable * SPEC.auditPpm) / 1_000_000n;
  return {
    payable,
    miner,
    validatorPool,
    audit,
    validators: validatorPool - audit,
    roundingDust: payable - miner - validatorPool,
    author: inclusionFee + tip,
    burned: 0n,
    totalDebit: payable + inclusionFee + tip,
  };
}
