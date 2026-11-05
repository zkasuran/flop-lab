// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import recording from "../fixtures/sdk-estimate.json";
import { FileLedger } from "../src/ledger";
import {
  guardedSession,
  guardedWalletMove,
  reconcileChannel,
  sdkFinalityPort,
  type SessionPlan,
  type SdkPort,
  type FinalityPort,
  type DevnetPermit,
  type SessionOptions,
  type EstimateProfile,
  type FinalityApi,
} from "../src/sdk";
import { policy, request as baseRequest, channelId, blockHash } from "./helpers";
const request = { ...baseRequest, amount: "2" };

let dir: string, ledger: FileLedger;
const idBytes = Uint8Array.from(Buffer.from(channelId.slice(2), "hex"));
// Only the API fields read by Spendguard exist in this fake. The write port is injected.
const api = { genesisHash: { toHex: () => blockHash } } as unknown as SessionPlan["session"]["api"];
const signer = { address: "throwaway-test" } as SessionPlan["session"]["signer"];
const permit: DevnetPermit = { network: "devnet", throwaway: true, genesisHash: blockHash, maxFlop: "10" };
type TestEstimate = EstimateProfile & {
  arch: typeof recording.input.arch;
  capGflopsPerSec: bigint;
  blockTimeMs: bigint;
  basePerTurnRaw: bigint;
};
const estimateInput: TestEstimate = {
  arch: recording.input.arch,
  turns: recording.input.turns.map((turn) => ({
    contextTokens: BigInt(turn.contextTokens),
    generatedTokens: BigInt(turn.generatedTokens),
  })),
  capGflopsPerSec: BigInt(recording.input.capGflopsPerSec),
  flopPerGn: recording.input.flopPerGn,
  blockTimeMs: BigInt(recording.input.blockTimeMs),
  basePerTurnRaw: BigInt(recording.input.basePerTurnRaw),
};
// Faithful fixed-profile fake: only the exact recorded SDK input is accepted.
const computeChannel = {
  estimateSession(input: TestEstimate) {
    expect(input).toEqual(estimateInput);
    return {
      escrowRaw: BigInt(recording.output.escrowRaw),
      channels: recording.output.channels.map((channel) => ({ escrowRaw: BigInt(channel.escrowRaw) })),
    };
  },
};
const plan: SessionPlan<SessionOptions, TestEstimate> = {
  session: { api, signer, miner: "miner", model: "model", prompt: "hello", maxTokens: 4 },
  estimate: estimateInput,
  source: "SDK 0.4.0 QWEN2_5_0_5B reference; synthetic token and calibration fixture",
  measuredAt: new Date(request.at).toISOString(),
};
const result = {
  reply: "test output",
  receipts: [],
  miner: "miner",
  channelId: idBytes,
  settleTx: blockHash,
  settlement: { channelId: idBytes, finalRoot: idBytes, aggregateGn: 1n, challengeEnd: 200n, txHash: blockHash },
};
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "spendguard-sdk-"));
  ledger = new FileLedger(join(dir, "audit"));
  await ledger.initialize();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
const options = () => ({ policy, ledger, now: () => request.at });
const port = (): SdkPort<SessionOptions, TestEstimate, typeof result> => ({
  estimateSession: computeChannel.estimateSession,
  runDirectSession: vi.fn(async () => result),
});

describe("SDK preflight", () => {
  it("replays the recorded SDK estimate, reserves exactly its escrow and binds maxFlop", async () => {
    const sdk = port(),
      estimate = computeChannel.estimateSession(plan.estimate);
    const response = await guardedSession(options(), request, plan, permit, { dryRun: false }, sdk);
    expect(response.status).toBe("returned");
    expect(sdk.runDirectSession).toHaveBeenCalledWith(expect.objectContaining({ maxFlop: estimate.escrowRaw }));
    expect((await ledger.verify()).reservations[0]?.charged).toBe(estimate.escrowRaw.toString());
    expect((await ledger.verify()).reservations[0]?.pending).toBe(true);
  });
  it("dry run estimates and checks policies without invoking the signer", async () => {
    const sdk = port();
    const response = await guardedSession(options(), request, plan, permit, { dryRun: true }, sdk);
    expect(response.status).toBe("dry-run");
    expect(sdk.runDirectSession).not.toHaveBeenCalled();
  });
  it("refuses disallowed miners before any write", async () => {
    const sdk = port();
    const response = await guardedSession(
      { ...options(), policy: { ...policy, denyMiners: ["miner"] } },
      request,
      plan,
      permit,
      { dryRun: false },
      sdk,
    );
    expect(response.status).toBe("denied");
    expect(sdk.runDirectSession).not.toHaveBeenCalled();
  });
  it("rejects stale quotes, mismatched identity, under-bounded tokens and hard-cap violations", async () => {
    const sdk = port();
    await expect(
      guardedSession(
        options(),
        request,
        { ...plan, measuredAt: new Date(request.at - 120_001).toISOString() },
        permit,
        { dryRun: false },
        sdk,
      ),
    ).rejects.toThrow("Fresh");
    await expect(
      guardedSession(options(), { ...request, miner: "other" }, plan, permit, { dryRun: false }, sdk),
    ).rejects.toThrow("identity");
    await expect(
      guardedSession(
        options(),
        request,
        { ...plan, session: { ...plan.session, maxTokens: 5 } },
        permit,
        { dryRun: false },
        sdk,
      ),
    ).rejects.toThrow("tokens");
    await expect(
      guardedSession(options(), request, plan, { ...permit, maxFlop: "0.00001" }, { dryRun: false }, sdk),
    ).rejects.toThrow("ceiling");
    expect(sdk.runDirectSession).not.toHaveBeenCalled();
  });
  it("cannot raise the caller's requested amount to meet an estimate", async () => {
    const sdk = port();
    await expect(
      guardedSession(options(), { ...request, amount: "0.01" }, plan, permit, { dryRun: false }, sdk),
    ).rejects.toThrow("requested amount");
    expect(sdk.runDirectSession).not.toHaveBeenCalled();
    expect((await ledger.verify()).reservations).toHaveLength(0);
  });
  it("an SDK refund claim alone cannot release the reservation", async () => {
    const sdk = port();
    sdk.runDirectSession = async () => {
      throw Object.assign(new Error("refunded"), { channelId: idBytes });
    };
    const response = await guardedSession(options(), request, plan, permit, { dryRun: false }, sdk);
    expect(response.status).toBe("failed");
    expect((await ledger.verify()).reservations[0]?.pending).toBe(true);
  });
  it("binds exact wallet transfer arguments and conservatively retains inclusion outcomes", async () => {
    const calls = {
      agentTransfer: vi.fn(async () => blockHash),
      fundAgentWallet: vi.fn(async () => blockHash),
      ownerWithdraw: vi.fn(async () => blockHash),
    };
    const r = { ...request, amount: "1", model: "wallet:transfer", pricePerGflop: "0" };
    const response = await guardedWalletMove(
      { ...options(), policy: { ...policy, allowModels: ["wallet:transfer"] } },
      r,
      api,
      signer as Parameters<typeof guardedWalletMove>[3],
      { kind: "transfer", destination: "miner" },
      permit,
      { dryRun: false },
      calls,
    );
    expect(response.status).toBe("returned");
    expect(calls.agentTransfer).toHaveBeenCalledWith(api, signer, "miner", 1000000000000000000n);
    expect((await ledger.verify()).reservations[0]?.pending).toBe(true);
  });
});

describe("finalized chain reconciliation", () => {
  it("reads SDK codec fields from the requested finalized block and maps named event data", async () => {
    const hash = { toHex: () => blockHash };
    const codec = (value: string) => ({ toString: () => value });
    const channels = vi.fn(async () => ({
      isSome: true,
      unwrap: () => ({ state: codec("Closed"), miner: codec("miner") }),
    }));
    const at = vi.fn(async () => ({
      query: {
        computeChannel: { channels },
        system: {
          events: async () => [
            {
              event: {
                section: "computeChannel",
                method: "TimedOutRefunded",
                data: [codec(channelId), codec("1000000000000000000")],
                meta: {
                  fields: ["channel_id", "refunded"].map((name) => ({
                    name: { isSome: true, unwrap: () => codec(name) },
                  })),
                },
              },
            },
          ],
        },
      },
    }));
    const fake = {
      at,
      rpc: {
        chain: {
          getFinalizedHead: async () => hash,
          getHeader: async () => ({ number: codec("99") }),
          getBlockHash: async () => hash,
        },
      },
    };
    // This fake implements only the polkadot methods the read adapter consumes.
    const reader = sdkFinalityPort(fake as unknown as FinalityApi, channelId);
    expect(await reader.finalizedHead()).toEqual({ hash: blockHash, number: 99n });
    const block = await reader.block(blockHash);
    expect(at).toHaveBeenCalledWith(blockHash);
    expect(channels).toHaveBeenCalledWith(channelId);
    expect(block.state).toEqual({ channelId, state: "Closed", miner: "miner" });
    expect(block.events).toEqual([
      { section: "computeChannel", method: "TimedOutRefunded", data: { channelId, refunded: "1000000000000000000" } },
    ]);
  });
  const chain = (method = "TimedOutRefunded"): FinalityPort => ({
    finalizedHead: async () => ({ hash: blockHash, number: 100n }),
    block: async () => ({
      hash: blockHash,
      number: 99n,
      canonicalHash: blockHash,
      state: { channelId, state: "Closed", miner: "miner" },
      events: [
        {
          section: "computeChannel",
          method,
          data: { channelId, refunded: computeChannel.estimateSession(plan.estimate).escrowRaw.toString() },
        },
      ],
    }),
  });
  it("releases only a full finalized matching refund and prevents refund replay", async () => {
    await guardedSession(options(), request, plan, permit, { dryRun: false }, port());
    await expect(
      reconcileChannel(options(), request.id, blockHash, "fake finalized devnet RPC", chain()),
    ).resolves.toBe("refunded");
    expect((await ledger.verify()).reservations[0]?.charged).toBe("0");
    await expect(reconcileChannel(options(), request.id, blockHash, "fake RPC", chain())).rejects.toThrow();
  });
  it.each(["future", "fork", "open", "wrong-channel", "partial", "absent"])(
    "holds funds for %s evidence",
    async (failure) => {
      await guardedSession(options(), request, plan, permit, { dryRun: false }, port());
      const c = chain(),
        original = await c.block(blockHash);
      const bad = { ...original };
      if (failure === "future") bad.number = 101n;
      if (failure === "fork") bad.canonicalHash = channelId;
      if (failure === "open") bad.state = { channelId, state: "Open", miner: "miner" };
      if (failure === "wrong-channel") bad.state = { channelId: blockHash, state: "Closed", miner: "miner" };
      if (failure === "partial")
        bad.events = [{ section: "computeChannel", method: "TimedOutRefunded", data: { channelId, refunded: "1" } }];
      if (failure === "absent") bad.events = [];
      c.block = async () => bad;
      await expect(reconcileChannel(options(), request.id, blockHash, "fake RPC", c)).rejects.toThrow();
      expect((await ledger.verify()).reservations[0]?.pending).toBe(true);
    },
  );
  it("settlement ends the hold but keeps the full escrow charged", async () => {
    await guardedSession(options(), request, plan, permit, { dryRun: false }, port());
    await reconcileChannel(options(), request.id, blockHash, "fake RPC", chain("Settled"));
    const reservation = (await ledger.verify()).reservations[0];
    expect(reservation?.pending).toBe(false);
    expect(reservation?.charged).not.toBe("0");
  });
});
