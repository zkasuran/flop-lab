// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { timelineGeometry } from "../app/swaps/model";
import { planSwap, type SwapPlanInput } from "../../../packages/swaps/src/planner";
import { sectionEvidence } from "../components/suite/evidence";
import fixture from "../../../packages/swaps/fixtures/swaps.json";

const input: SwapPlanInput = {
  flopBlocks: "7200",
  otherBlocks: "6",
  flopBlockMs: "1000",
  otherBlockMs: "600000",
  currentFinalityLag: "0",
  refundHead: "finalized",
  counterRefundBeforeLateClaim: true,
};

it("places admission equality exactly on the timeline safety boundary", () => {
  const geometry = timelineGeometry(planSwap(input));
  expect(geometry.legs[1]!.scale).toBe(geometry.safeBoundary);
  expect(geometry.foreignBoundary).toBeLessThan(geometry.safeBoundary!);
  expect(geometry.legs[0]!.scale).toBe(geometry.foreignBoundary);
});

it("keeps a short FLOP timelock outside the safe region and a reversed timeout before the foreign leg", () => {
  const short = timelineGeometry(planSwap({ ...input, flopBlocks: "4320" }));
  expect(short.legs[1]!.scale).toBeLessThan(short.safeBoundary!);
  expect(short.legs[1]!.scale).toBeGreaterThan(short.foreignBoundary);
  const reversed = timelineGeometry(planSwap({ ...input, flopBlocks: "3000" }));
  expect(reversed.legs[1]!.scale).toBeLessThan(reversed.foreignBoundary);
});

it("does not draw a safe boundary from unknown lag or overflow the axis on large inputs", () => {
  expect(timelineGeometry(planSwap({ ...input, currentFinalityLag: null })).safeBoundary).toBeNull();
  const geometry = timelineGeometry(
    planSwap({
      ...input,
      flopBlocks: "12000000000000000000",
      otherBlocks: "10000000000000000000",
      otherBlockMs: "1000",
    }),
  );
  expect(geometry.safeBoundary).toBe(geometry.legs[1]!.scale);
  expect(geometry.legs[0]!.scale).toBeGreaterThan(0);
  expect(geometry.legs[1]!.scale).toBeLessThan(1);
});

it("registers the measured zero order total rather than the nonempty HTLC count", () => {
  const metric = sectionEvidence().swaps;
  expect(metric?.value).toBe(0);
  expect(metric?.measuredAt).toBe(fixture.measuredAt);
  expect(metric?.source).toBe(fixture.source);
  expect(metric?.label).toContain("orders");
});
