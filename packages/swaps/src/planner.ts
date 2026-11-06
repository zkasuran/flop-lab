// SPDX-License-Identifier: Apache-2.0
import paper from "../fixtures/paper.json";

export const specification = { source: paper.source, measuredAt: paper.measuredAt, commit: paper.commit };
const parameter = (name: string): string => {
  const row = paper.parameters.find((line) => line.includes(`id="param-${name}"`));
  const match = row
    ?.split("|")[2]
    ?.trim()
    .match(/^([\d_]+) /);
  if (!match) throw new Error(`Missing pinned parameter: ${name}`);
  return match[1]!.replaceAll("_", "");
};
export const parameters = {
  marginPercent: parameter("htlc_timelock_symmetry_safety_margin_percent"),
  maxFinalityStall: parameter("max_finality_stall"),
  freezeThreshold: parameter("finality_freeze_threshold"),
  btcBlockSeconds: parameter("btc_block_time_flop_blocks"),
  burnSharePpt: parameter("htlc_burn_share_ppt"),
};

export interface SwapPlanInput {
  /** Remaining blocks measured from the same planning instant, not absolute heights. */
  flopBlocks: string;
  otherBlocks: string;
  flopBlockMs: string;
  otherBlockMs: string;
  currentFinalityLag: string | null;
  refundHead: "finalized" | "tip" | "unknown";
  counterRefundBeforeLateClaim: boolean | null;
}
export type CheckStatus = "PASS" | "FAIL" | "UNKNOWN";
export interface RuleCheck {
  id: string;
  status: CheckStatus;
  explanation: string;
  quote: string;
}
const quotes = {
  clock: "After converting the foreign duration to one-second FLOP blocks",
  freeze:
    "if `current_finality_lag` is at or above\n  [`finality_freeze_threshold`](#param-finality_freeze_threshold), the open is rejected.",
  margin: "`T_FLOP ≥ T_other + max(ceil(T_other × p / 100), max_finality_stall + current_finality_lag)`",
  refund:
    "A refund **MUST** be gated on the AlephBFT **finalized** head, not the\n  tip (a tip-gated refund is reorg-unsafe).",
  ordering:
    "Completion and refund targets therefore depend on both\nchains' inclusion and terminal-transition ordering, including counter refund before a late claim.",
};
function integer(value: unknown, name: string, positive = false): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,29})$/.test(value))
    throw new Error(`${name} must be an unsigned decimal integer of at most 30 digits`);
  const result = BigInt(value);
  if (positive && result === 0n) throw new Error(`${name} must be greater than zero`);
  return result;
}
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** Evaluate declared timing assumptions against the pinned paper. This is not chain admission.
 * @example planSwap({ flopBlocks: "7200", otherBlocks: "6", flopBlockMs: "1000", otherBlockMs: "600000", currentFinalityLag: "0", refundHead: "finalized", counterRefundBeforeLateClaim: true });
 */
export function planSwap(input: SwapPlanInput) {
  const flop = integer(input.flopBlocks, "FLOP duration", true);
  const other = integer(input.otherBlocks, "Other duration", true);
  const flopMs = integer(input.flopBlockMs, "FLOP block interval", true);
  const otherMs = integer(input.otherBlockMs, "Other block interval", true);
  const lag = input.currentFinalityLag === null ? null : integer(input.currentFinalityLag, "Finality lag");
  if (!["finalized", "tip", "unknown"].includes(input.refundHead)) throw new Error("Invalid refund head");
  if (input.counterRefundBeforeLateClaim !== null && typeof input.counterRefundBeforeLateClaim !== "boolean")
    throw new Error("Invalid counter-chain ordering assumption");
  // R10.2 uses one-second FLOP blocks, independent of an observed average block interval.
  const converted = ceilDiv(other * otherMs, 1000n);
  const percentage = ceilDiv(converted * BigInt(parameters.marginPercent), 100n);
  const stall = lag === null ? null : BigInt(parameters.maxFinalityStall) + lag;
  const margin = stall === null ? null : percentage > stall ? percentage : stall;
  const required = margin === null ? null : converted + margin;
  const checks: RuleCheck[] = [
    {
      id: "R10.2-order",
      status: flop > converted ? "PASS" : "FAIL",
      quote: quotes.margin,
      explanation: `The FLOP leg must outlast the foreign leg. Declared ${flop} versus ${converted} one-second blocks before the safety allowance.`,
    },
    {
      id: "R10.2-clock",
      status: flopMs === 1000n ? "PASS" : "UNKNOWN",
      quote: quotes.clock,
      explanation:
        flopMs === 1000n
          ? "The scenario uses the specified one-second FLOP clock."
          : "A different FLOP interval is a wall-clock scenario. It cannot establish this admission rule.",
    },
    {
      id: "R10.2-freeze",
      status: lag === null ? "UNKNOWN" : lag >= BigInt(parameters.freezeThreshold) ? "FAIL" : "PASS",
      quote: quotes.freeze,
      explanation:
        lag === null
          ? "Current finality lag is missing. Admission cannot be checked."
          : `Declared lag ${lag} blocks; new opens require lag below ${parameters.freezeThreshold}.`,
    },
    {
      id: "R10.2-margin",
      status: required === null ? "UNKNOWN" : flop >= required ? "PASS" : "FAIL",
      quote: quotes.margin,
      explanation:
        required === null
          ? "The finality allowance is unknown without lag."
          : `Require at least ${required} FLOP blocks: ${converted} foreign + max(${percentage} percentage, ${stall} finality). Declared ${flop}. Equality passes.`,
    },
    {
      id: "R10.3-refund",
      status: input.refundHead === "unknown" ? "UNKNOWN" : input.refundHead === "finalized" ? "PASS" : "FAIL",
      quote: quotes.refund,
      explanation:
        input.refundHead === "finalized"
          ? "The scenario requires a finalized-head refund."
          : input.refundHead === "tip"
            ? "Tip-gated refunds violate R10.3."
            : "The refund gate has not been declared.",
    },
    {
      id: "10.2-ordering",
      status:
        input.counterRefundBeforeLateClaim === null ? "UNKNOWN" : input.counterRefundBeforeLateClaim ? "PASS" : "FAIL",
      quote: quotes.ordering,
      explanation:
        input.counterRefundBeforeLateClaim === true
          ? "Counter refund before a late claim is an explicit scenario assumption."
          : input.counterRefundBeforeLateClaim === false
            ? "The counter-chain ordering assumption is not met."
            : "Counter-chain terminal ordering has not been established.",
    },
  ];
  const status: CheckStatus = checks.some((c) => c.status === "FAIL")
    ? "FAIL"
    : checks.some((c) => c.status === "UNKNOWN")
      ? "UNKNOWN"
      : "PASS";
  return {
    status,
    checks,
    input,
    specification,
    parameters,
    evaluatedAt: new Date().toISOString(),
    source: "local calculation over declared inputs and pinned specification",
    direction: "counter-chain reveal to FLOP relay",
    otherFlopBlocks: converted.toString(),
    percentageMarginBlocks: percentage.toString(),
    finalityMarginBlocks: stall?.toString() ?? null,
    requiredFlopBlocks: required?.toString() ?? null,
    headroomBlocks: required === null ? null : (flop - required).toString(),
    flopDurationMs: (flop * flopMs).toString(),
    otherDurationMs: (other * otherMs).toString(),
    limitation:
      "Declared timing conditions only. No deployed chain-pair completion guarantee is asserted by the pinned paper.",
  };
}
