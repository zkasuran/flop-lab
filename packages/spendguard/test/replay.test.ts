// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import recording from "../fixtures/settlements.json";
import estimate from "../fixtures/sdk-estimate.json";
import { estimateTape, replayTape, settlementTape, type ReplayTape } from "../src/replay";
import { formatFlop, parseFlop } from "../src/policy";
import { policy } from "./helpers";

const tape = settlementTape(recording);
const chosen = {
  ...policy,
  maxEscrowPerSession: "5",
  allowModels: [...new Set(tape.rows.flatMap((r) => (r.model ? [r.model] : [])))],
  allowMiners: [...new Set(tape.rows.map((r) => r.miner))],
};
const scenario: ReplayTape = {
  source: "test fixture",
  measuredAt: "2026-11-06T00:00:00.000Z",
  kind: "settlements",
  partial: false,
  assumptions: ["synthetic"],
  rows: [
    { id: "a", agent: "one", at: 1, model: "model", miner: "miner", amount: "6", pricePerGflop: "0.1" },
    { id: "b", agent: "two", at: 2, model: "model", miner: "miner", amount: "5", pricePerGflop: "0.1" },
    { id: "c", agent: "two", at: 3, model: "model", miner: "miner", amount: "4", pricePerGflop: "0.1" },
  ],
};
it("replays the recorded page and conserves all exposure exactly", () => {
  const result = replayTape(chosen, tape);
  expect(tape.rows).toHaveLength(100);
  expect(tape.partial).toBe(true);
  expect(result.totals.allowed + result.totals.refused + result.totals.skipped).toBe(tape.rows.length);
  expect(
    parseFlop(result.totals.allowedFlop) + parseFlop(result.totals.refusedFlop) + parseFlop(result.totals.skippedFlop),
  ).toBe(tape.rows.reduce((n, r) => n + parseFlop(r.amount), 0n));
  expect(parseFlop(result.totals.allowedFlop)).toBeLessThanOrEqual(parseFlop(chosen.budgets.total));
  expect(result).toEqual(replayTape(chosen, { ...tape, rows: [...tape.rows].reverse() }));
  console.log(JSON.stringify({ source: tape.source, capturedAt: tape.measuredAt, ...result.totals }));
});
it("admits only allowed rows and exposes exact running totals", () => {
  const result = replayTape(policy, scenario);
  expect(result.steps.map((s) => s.status)).toEqual(["allow", "deny", "allow"]);
  expect(result.steps.map((s) => s.totals.allowedFlop)).toEqual(["6", "6", "10"]);
  expect(result.totals).toEqual({
    allowed: 2,
    refused: 1,
    skipped: 0,
    allowedFlop: "10",
    refusedFlop: "5",
    skippedFlop: "0",
  });
  expect(replayTape(policy, scenario, 1).totals.allowedFlop).toBe("6");
});
it("keeps old reservations pending and skips absent model identities", () => {
  const changed = structuredClone(scenario);
  changed.rows[1]!.at += 86_400_000;
  changed.rows[2]!.at += 86_400_000;
  changed.rows[2]!.model = null;
  expect(replayTape(policy, changed).steps.map((s) => s.status)).toEqual(["allow", "deny", "skipped"]);
});
it("handles empty pages and rejects malformed pagination, amounts, times and duplicates", () => {
  const page = JSON.parse(recording.raw) as { data: Record<string, unknown>[]; pagination: Record<string, unknown> };
  expect(
    settlementTape({
      ...recording,
      raw: JSON.stringify({ data: [], pagination: { total: 0, offset: 0, limit: 100, hasMore: false } }),
    }).rows,
  ).toEqual([]);
  expect(replayTape(policy, { ...scenario, rows: [] }).totals.allowed).toBe(0);
  for (const patch of [
    { escrow: "-1" },
    { minerPaid: "0" },
    { pricePerGflop: "1e10" },
    { settledAt: -1 },
    { agent: "" },
  ]) {
    expect(() =>
      settlementTape({ ...recording, raw: JSON.stringify({ ...page, data: [{ ...page.data[0], ...patch }] }) }),
    ).toThrow();
  }
  expect(() =>
    settlementTape({ ...recording, raw: JSON.stringify({ ...page, data: [page.data[0], page.data[0]] }) }),
  ).toThrow("duplicate");
  expect(() => replayTape(policy, scenario, -1)).toThrow();
});
it("rounds raw fractional GFLOP prices up without losing decimal precision", () => {
  const page = JSON.parse(recording.raw) as { data: Record<string, unknown>[]; pagination: Record<string, unknown> };
  const row = { ...page.data[0], pricePerGflop: "5742000000000000.566666666666666666" };
  const parsed = settlementTape({ ...recording, raw: JSON.stringify({ ...page, data: [row] }) });
  expect(parsed.rows[0]?.pricePerGflop).toBe("0.005742000000000001");
});
it("replays the recorded SDK estimate under labelled chosen identities", () => {
  const sdk = estimateTape(estimate, { agent: "demo", model: "model", miner: "miner" });
  expect(replayTape(policy, sdk).totals.allowedFlop).toBe(formatFlop(BigInt(estimate.output.escrowRaw)));
  expect(replayTape({ ...policy, maxEscrowPerSession: "1" }, sdk).totals.refusedFlop).toBe("1.3");
  expect(() =>
    estimateTape(
      { ...estimate, output: { ...estimate.output, escrowRaw: "1" } },
      { agent: "demo", model: "model", miner: "miner" },
    ),
  ).toThrow();
});
