// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { runTurn } from "../src/agent";
import { recordedSources } from "../src/inputs";
import { assertDevnet, discoverModels, policyFor } from "../src/guards";
import { checkArithmetic, sealEvidence } from "@flop-lab/verifier";
import { FileLedger } from "@flop-lab/spendguard";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "flop-agent-test-"));
  dirs.push(dir);
  await new FileLedger(join(dir, "ledger.jsonl")).initialize();
  return { ...(await recordedSources()), maxFlop: "0.1", ledgerPath: join(dir, "ledger.jsonl") };
}

test("recorded dry run never reaches paid transport", async () => {
  const options = await setup();
  const paidCall = vi.fn();
  const result = await runTurn({ ...options, paidCall });
  expect(["quote-required", "no-eligible-miner"]).toContain(result.status);
  expect(result.provenance.snapshot).toBe(options.snapshot.measuredAt);
  expect(paidCall).not.toHaveBeenCalled();
});

test.each(["FLOP Mainnet", "devnet", "", null])("devnet guard blocks discovery for chain %s", async (chain) => {
  const options = await setup();
  const discover = vi.fn(options.sources.discover);
  const health = await options.sources.health();
  const sources = {
    ...options.sources,
    discover,
    health: async () => ({ ...health, value: { connected: true, syncing: false, peers: 1, chain } }),
  };
  await expect(runTurn({ ...options, sources })).rejects.toThrow("Devnet guard refused");
  expect(discover).not.toHaveBeenCalled();
});

test("stale, future, disconnected and malformed health all fail closed", async () => {
  const { now, sources } = await setup();
  const health = await sources.health();
  for (const at of [new Date(now() - 30_001).toISOString(), new Date(now() + 1).toISOString(), "invalid"]) {
    expect(() => assertDevnet(health.value, at, now())).toThrow();
  }
  for (const value of [null, [], {}, { chain: "FLOP Devnet", connected: false, syncing: false, peers: 0 }]) {
    expect(() => assertDevnet(value, health.measuredAt, now())).toThrow();
  }
});

test("empty discovery is a no-data result; malformed discovery is rejected", async () => {
  const options = await setup();
  const discovery = await options.sources.discover();
  const sources = { ...options.sources, discover: async () => ({ ...discovery, value: { models: [] } }) };
  expect((await runTurn({ ...options, sources })).status).toBe("no-eligible-miner");
  for (const value of [null, {}, { models: [null] }, { models: [{ modelName: "a", served: "true" }] }]) {
    expect(() => discoverModels(value)).toThrow();
  }
});

test.each(["0", "1.000000000000000001", "1000", "-1", "1e-3", "NaN"])("hard ceiling rejects %s", (amount) => {
  expect(() => policyFor(amount, "model", "miner")).toThrow();
});

test("verifier detects tampering in an actual recorded settlement", async () => {
  const { snapshot } = await setup();
  const tape = snapshot.records.find((record) => record.kind === "settlements")!;
  const rows = tape.raw.data as Record<string, unknown>[];
  const row = rows[0]!;
  expect(checkArithmetic(row).find((check) => check.id === "escrow-conservation")?.status).toBe("PASS");
  expect(checkArithmetic({ ...row, escrow: "0" }).some((check) => check.status === "FAIL")).toBe(true);
});

async function quoted() {
  const options = await setup();
  const plan = await runTurn(options);
  if (!plan.route || plan.route.status !== "picked") throw new Error("Recorded route changed");
  // Synthetic policy exercise. These amounts are not live price measurements.
  const quote = {
    model: plan.route.explanation.model,
    miner: plan.route.miner,
    maxFlop: "0.01",
    pricePerGflop: "0.0001",
    expiresAt: new Date(options.now() + 20_000).toISOString(),
  };
  return { ...options, quote, requestId: "rehearsal" };
}

test("Spendguard admits a rehearsal without calling an adapter and requires it before execution", async () => {
  const options = await quoted();
  const paidCall = vi.fn();
  expect((await runTurn({ ...options, paidCall, dryRun: false })).status).toBe("denied");
  expect((await runTurn({ ...options, paidCall })).status).toBe("dry-run");
  expect(paidCall).not.toHaveBeenCalled();
});

test("over-budget, stale and wrong-miner quotes cannot reach a paid adapter", async () => {
  const options = await quoted();
  const paidCall = vi.fn();
  for (const patch of [
    { maxFlop: "0.100000000000000001" },
    { expiresAt: new Date(options.now()).toISOString() },
    { miner: "wrong" },
  ]) {
    await expect(runTurn({ ...options, quote: { ...options.quote, ...patch }, paidCall })).rejects.toThrow(
      "Quote does not match",
    );
  }
  expect((await runTurn({ ...options, quote: { ...options.quote, pricePerGflop: "0.002" }, paidCall })).status).toBe(
    "denied",
  );
  expect(paidCall).not.toHaveBeenCalled();
});

test("a chain change after admission blocks the adapter", async () => {
  const options = await quoted();
  await runTurn(options);
  const original = await options.sources.health();
  const health = vi
    .fn()
    .mockResolvedValueOnce(original)
    .mockResolvedValue({ ...original, value: { chain: "FLOP Mainnet" } });
  const paidCall = vi.fn();
  const result = await runTurn({ ...options, dryRun: false, paidCall, sources: { ...options.sources, health } });
  expect(result.status).toBe("failed");
  expect(paidCall).not.toHaveBeenCalled();
});

test("an admitted fake adapter is followed by a settlement fetch and its reservation stays charged", async () => {
  const options = await quoted();
  await runTurn(options);
  const channelId = `0x${"a".repeat(64)}`;
  const paidCall = vi.fn(async () => ({ channelId }));
  const settlement = vi.fn(async () => {
    throw new Error("settlement unavailable");
  });
  await expect(
    runTurn({ ...options, dryRun: false, paidCall, sources: { ...options.sources, settlement } }),
  ).rejects.toThrow("settlement unavailable");
  expect(settlement).toHaveBeenCalledWith(channelId);
  expect(paidCall).toHaveBeenCalledOnce();
  expect((await runTurn({ ...options, dryRun: false, paidCall })).status).toBe("denied");
  expect(paidCall).toHaveBeenCalledOnce();
});

test("missing evidence remains verification-incomplete after an admitted fake call", async () => {
  const options = await quoted();
  await runTurn(options);
  const channelId = `0x${"b".repeat(64)}`;
  const evidence = await sealEvidence({
    version: 1,
    network: "flop-devnet",
    channelId,
    capturedAt: new Date(options.now()).toISOString(),
    observations: [],
  });
  const result = await runTurn({
    ...options,
    dryRun: false,
    paidCall: async () => ({ channelId }),
    sources: { ...options.sources, settlement: async () => evidence },
  });
  expect(result.status).toBe("verification-incomplete");
  expect(result.verification?.checks.some((check) => check.status === "UNVERIFIABLE")).toBe(true);
});
