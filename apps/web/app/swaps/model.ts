// SPDX-License-Identifier: Apache-2.0
import type { planSwap } from "../../../../packages/swaps/src/planner";

/** Project exact durations onto a common display axis without inventing an unknown safety boundary.
 * @example const geometry = timelineGeometry(planSwap(input));
 */
export function timelineGeometry(plan: ReturnType<typeof planSwap>) {
  const other = BigInt(plan.otherDurationMs),
    flop = BigInt(plan.flopDurationMs);
  const required = plan.requiredFlopBlocks === null ? null : BigInt(plan.requiredFlopBlocks) * 1000n;
  const max = [other, flop, required ?? 0n].reduce((a, b) => (a > b ? a : b));
  const domain = max + max / 5n + 1n;
  const ratio = (value: bigint) => Number((value * 1_000_000n) / domain) / 1_000_000;
  return {
    foreignBoundary: ratio(other),
    safeBoundary: required === null ? null : ratio(required),
    legs: [
      { label: "Other chain", blocks: plan.input.otherBlocks, ms: plan.otherDurationMs, scale: ratio(other) },
      { label: "FLOP", blocks: plan.input.flopBlocks, ms: plan.flopDurationMs, scale: ratio(flop) },
    ],
  };
}
