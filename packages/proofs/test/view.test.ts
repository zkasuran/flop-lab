// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { recordedProofs, analyzeRecording, recordedInput } from "../src/index";
import { proofView, selectSettlements } from "../../../apps/web/app/proofs/view";

it("retains per-source times and a reason for every recorded settlement", () => {
  const report = recordedProofs(),
    view = proofView(report);
  expect(view.proofs.measuredAt).toBe(report.proofs.measuredAt);
  expect(view.settlements.measuredAt).toBe(report.settlements.measuredAt);
  expect(view.settlements.value?.rows.every((s) => s.status === "UNVERIFIABLE" && view.reasons[s.code])).toBe(true);
  expect(JSON.stringify(view)).not.toContain('"raw":');
});
it("sorts by recorded event time and filters full identifiers without mutating data", () => {
  const view = proofView(recordedProofs());
  const newest = selectSettlements(view, "", "newest"),
    oldest = selectSettlements(view, "", "oldest");
  expect(newest[0]!.settledAt).toBeGreaterThan(oldest[0]!.settledAt);
  const id = newest[0]!.channelId;
  expect(selectSettlements(view, id.toUpperCase(), "oldest")).toHaveLength(1);
  expect(selectSettlements(view, "unknown-channel", "newest")).toEqual([]);
  expect(view.settlements.value?.rows[0]!.channelId).toBe(newest[0]!.channelId);
});
it("keeps unavailable data separate from measured zero", () => {
  const input = recordedInput();
  input.captures = [];
  const view = proofView(analyzeRecording(input));
  expect(view.proofs.value).toBeNull();
  expect(view.settlements.value).toBeNull();
  expect(selectSettlements(view, "", "newest")).toEqual([]);
});
