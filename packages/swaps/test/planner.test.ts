// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parameters, planSwap, type SwapPlanInput } from "../src/planner";
import paper from "../fixtures/paper.json";
import scenarios from "../fixtures/synthetic.json";

const input: SwapPlanInput = {
  flopBlocks: "7200",
  otherBlocks: "6",
  flopBlockMs: "1000",
  otherBlockMs: "600000",
  currentFinalityLag: "0",
  refundHead: "finalized",
  counterRefundBeforeLateClaim: true,
};
describe("pinned R10 timing", () => {
  it("reads documented parameters and quotes exact rule fragments", () => {
    expect(parameters).toEqual({
      marginPercent: "20",
      maxFinalityStall: "3600",
      freezeThreshold: "120",
      btcBlockSeconds: "600",
      burnSharePpt: "0",
    });
    for (const check of planSwap(input).checks) expect(paper.raw).toContain(check.quote);
  });
  it.each(scenarios.cases)("labels synthetic scenario: $name", (scenario) => {
    expect(scenarios.kind).toBe("synthetic");
    expect(planSwap({ ...input, flopBlocks: scenario.flopBlocks, otherBlocks: scenario.otherBlocks }).status).toBe(
      scenario.expected,
    );
  });
  it("uses the finality allowance rather than only twenty percent", () => {
    const result = planSwap({ ...input, flopBlocks: "4320" });
    expect(result.status).toBe("FAIL");
    expect(result.otherFlopBlocks).toBe("3600");
    expect(result.percentageMarginBlocks).toBe("720");
    expect(result.finalityMarginBlocks).toBe("3600");
    expect(result.requiredFlopBlocks).toBe("7200");
    expect(result.headroomBlocks).toBe("-2880");
  });
  it("includes lag and rejects the exact freeze threshold even with excess time", () => {
    expect(planSwap({ ...input, currentFinalityLag: "1" }).status).toBe("FAIL");
    expect(planSwap({ ...input, flopBlocks: "7319", currentFinalityLag: "119" }).status).toBe("PASS");
    const frozen = planSwap({ ...input, flopBlocks: "999999", currentFinalityLag: "120" });
    expect(frozen.status).toBe("FAIL");
    expect(frozen.checks.find((c) => c.id === "R10.2-freeze")?.status).toBe("FAIL");
  });
  it("rounds foreign subsecond durations up and then rounds the margin up", () => {
    const result = planSwap({ ...input, flopBlocks: "21602", otherBlocks: "1", otherBlockMs: "18000001" });
    expect(result.otherFlopBlocks).toBe("18001");
    expect(result.percentageMarginBlocks).toBe("3601");
    expect(result.requiredFlopBlocks).toBe("21602");
    expect(result.status).toBe("PASS");
  });
  it("does exact arithmetic beyond safe JS integers", () => {
    const result = planSwap({
      ...input,
      flopBlocks: "12000000000000000001",
      otherBlocks: "10000000000000000000",
      otherBlockMs: "1000",
    });
    expect(result.requiredFlopBlocks).toBe("12000000000000000000");
    expect(result.headroomBlocks).toBe("1");
  });
  it("keeps missing lag and undeclared ordering unknown", () => {
    expect(planSwap({ ...input, flopBlocks: "3000", currentFinalityLag: null }).status).toBe("FAIL");
    const result = planSwap({ ...input, currentFinalityLag: null });
    expect(result.status).toBe("UNKNOWN");
    expect(result.requiredFlopBlocks).toBeNull();
    expect(planSwap({ ...input, refundHead: "unknown" }).status).toBe("UNKNOWN");
    expect(planSwap({ ...input, counterRefundBeforeLateClaim: null }).status).toBe("UNKNOWN");
    expect(planSwap({ ...input, flopBlockMs: "2000" }).status).toBe("UNKNOWN");
  });
  it("fails a tip refund and missing counter-refund ordering", () => {
    expect(planSwap({ ...input, refundHead: "tip" }).status).toBe("FAIL");
    expect(planSwap({ ...input, counterRefundBeforeLateClaim: false }).status).toBe("FAIL");
  });
  it.each(["", "-1", "1.5", " 6", "06", "1e9", "Infinity", "9".repeat(31)])("rejects hostile duration %j", (value) => {
    expect(() => planSwap({ ...input, otherBlocks: value })).toThrow();
  });
  it("rejects zero intervals and durations but accepts zero lag", () => {
    expect(() => planSwap({ ...input, flopBlocks: "0" })).toThrow();
    expect(() => planSwap({ ...input, otherBlockMs: "0" })).toThrow();
    expect(planSwap(input).status).toBe("PASS");
  });
});
