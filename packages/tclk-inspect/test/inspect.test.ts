// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { inspectTranscript, parseTranscript } from "../src/inspect";
import { simulate } from "../src/simulate";
import comparisons from "../fixtures/simulations.json";

describe("pinned upstream comparison", () => {
  for (const example of comparisons.cases) {
    it(example.path, () => {
      const report = inspectTranscript(example.records);
      if (example.path === "noncanonical") {
        expect(report.firstViolation?.index).toBe(0);
        expect(report.firstViolation?.reason).toContain("canonical");
      } else if (["replay-heartbeat", "replay-receipt"].includes(example.path)) {
        expect(report.firstViolation?.index).toBe(example.records.length - 1);
        expect(report.firstViolation?.reason).toContain("duplicate");
        expect(example.upstream.steps.every((s) => s.ok)).toBe(true);
      } else {
        expect(report.steps.map((s) => s.ok)).toEqual(example.upstream.steps.map((s) => s.ok));
        expect(report.state?.status ?? null).toBe(example.upstream.status);
      }
    });
  }
});

it("checks witnesses and does not let a failed reveal advance state", () => {
  const report = inspectTranscript(simulate("wrong-preimage"));
  expect(report.verdict).toBe("violation");
  expect(report.firstViolation).toMatchObject({
    index: 3,
    from: "locked",
    to: "locked",
    section: "3.4",
    reason: "witness does not open the statement",
  });
  expect(report.state?.status).toBe("locked");
});
it("allows a late reveal but rejects the exact refund boundary", () => {
  expect(inspectTranscript(simulate("late-reveal")).steps[3]?.warnings[0]).toContain("Late reveal");
  expect(inspectTranscript(simulate("reveal-at-refund")).firstViolation?.reason).toBe("refund window is open");
  expect(inspectTranscript(simulate("refund")).state?.status).toBe("refunded");
});
it("does not manufacture a terminal state from the auditor clock", () => {
  expect(inspectTranscript(simulate("timeout")).state?.status).toBe("locked");
});
it("preserves inputs and returns detached simulations", () => {
  const input = simulate("happy");
  const before = JSON.stringify(input);
  inspectTranscript(input);
  expect(JSON.stringify(input)).toBe(before);
  input.records[0]!.line = "changed";
  expect(simulate("happy").records[0]!.line).not.toBe("changed");
});
it("rejects missing time, numeric nonce, unsigned records and forged sender", () => {
  for (const patch of [
    { timestampMs: undefined },
    { timestampMs: Infinity },
    { nonce: 100 },
    { signature: null },
    { sender: "did:key:forged" },
  ]) {
    const input = simulate("happy");
    Object.assign(input.records[0]!, patch);
    expect(inspectTranscript(input).firstViolation?.index).toBe(0);
  }
});
it("handles hostile and empty input without throwing during a fold", () => {
  for (const input of [null, {}, 1, "tclk1 {}", [null], [[], {}], Array(501).fill(null)])
    expect(inspectTranscript(input).verdict).toBe("violation");
  expect(inspectTranscript([]).verdict).toBe("no-data");
  expect(() => parseTranscript("[")).toThrow();
  expect(() => parseTranscript(" ".repeat(2_000_001))).toThrow("exceeds");
});
