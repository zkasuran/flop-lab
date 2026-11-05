// SPDX-License-Identifier: Apache-2.0
import { guardedSpend, type GuardOptions } from "./guard";
import { formatFlop, parseFlop, type SpendRequest } from "./policy";

/** Structural SDK 0.4.0 ports preserve the application's concrete API and signer types. */
export interface GenesisApi {
  genesisHash: { toHex(): string };
}
export interface AddressSigner {
  address: string;
}
export interface SessionOptions {
  api: GenesisApi;
  signer: AddressSigner;
  miner: string;
  model: string;
  maxFlop: bigint;
  maxTokens?: number;
  prompt?: string;
  messages?: unknown;
  endpoint?: string;
  indexerUrl?: string;
  headers?: Record<string, string>;
  via?: "auto" | "offer" | "force";
}
export interface EstimateProfile {
  turns: readonly { contextTokens: bigint; generatedTokens: bigint }[];
  flopPerGn: string;
}
export interface SessionOutput {
  miner: string;
  channelId: Uint8Array;
}
export interface EstimateOutput {
  escrowRaw: bigint;
  channels: readonly { escrowRaw: bigint }[];
}
export interface DevnetPermit {
  network: "devnet";
  throwaway: true;
  /** The owner must verify this against the devnet faucet before funding. */
  genesisHash: string;
  /** Additional hard ceiling in FLOP, independent of policy. */
  maxFlop: string;
}
export interface SessionPlan<O extends SessionOptions = SessionOptions, E extends EstimateProfile = EstimateProfile> {
  session: Omit<O, "maxFlop">;
  estimate: E;
  /** Provenance for the supplied architecture, token bound, price and calibration. */
  source: string;
  measuredAt: string;
}
export interface SdkPort<
  O extends SessionOptions = SessionOptions,
  E extends EstimateProfile = EstimateProfile,
  R extends SessionOutput = SessionOutput,
> {
  estimateSession: (input: E) => EstimateOutput;
  runDirectSession: (options: O) => Promise<R>;
}
function permitSpend(api: GenesisApi, permit: DevnetPermit, raw: bigint) {
  if (
    permit.network !== "devnet" ||
    permit.throwaway !== true ||
    !/^0x[a-f0-9]{64}$/i.test(permit.genesisHash) ||
    api.genesisHash.toHex().toLowerCase() !== permit.genesisHash.toLowerCase()
  )
    throw new Error("A matching throwaway devnet permit is required");
  if (raw <= 0n || raw > parseFlop(permit.maxFlop)) throw new Error("Hard maxFlop ceiling exceeded");
}
/**
 * Estimate one direct SDK session and reserve its entire escrow before signing.
 * A dry run invokes the estimator but never runDirectSession. Quotes expire after 120 seconds.
 * @example await guardedSession(guard, request, plan, permit, { dryRun: true }, sdkPort)
 */
export async function guardedSession<O extends SessionOptions, E extends EstimateProfile, R extends SessionOutput>(
  options: GuardOptions,
  request: SpendRequest,
  input: SessionPlan<O, E>,
  permit: DevnetPermit,
  mode: { dryRun: boolean },
  sdk: SdkPort<O, E, R>,
) {
  // Clone all mutable spend-bearing data before the first ledger await.
  const { api, signer, ...sessionData } = input.session;
  const session = structuredClone(sessionData);
  const estimateInput = structuredClone(input.estimate);
  const measured = Date.parse(input.measuredAt);
  const now = (options.now ?? Date.now)();
  if (!input.source.trim() || !Number.isFinite(measured) || measured > now || now - measured > 120_000)
    throw new Error("Fresh sourced estimate inputs required");
  if (
    session.miner !== request.miner ||
    session.model !== request.model ||
    parseFlop(estimateInput.flopPerGn) !== parseFlop(request.pricePerGflop)
  )
    throw new Error("Request identity or price differs from session plan");
  const maxTokens = session.maxTokens ?? 256;
  if (
    estimateInput.turns.length !== 1 ||
    !Number.isSafeInteger(maxTokens) ||
    maxTokens < 1 ||
    (estimateInput.turns[0]?.generatedTokens ?? 0n) < BigInt(maxTokens)
  )
    throw new Error("Estimate must bound the single direct turn's maximum tokens");
  const estimate = sdk.estimateSession(estimateInput);
  if (
    estimate.channels.length !== 1 ||
    typeof estimate.escrowRaw !== "bigint" ||
    estimate.escrowRaw <= 0n ||
    estimate.escrowRaw !== estimate.channels[0]?.escrowRaw
  )
    throw new Error("Expected one nonzero estimated escrow");
  const raw = estimate.escrowRaw;
  if (raw > parseFlop(request.amount)) throw new Error("Estimate exceeds requested amount ceiling");
  permitSpend(api, permit, raw);
  // maxFlop equals the admitted estimate, never the full remaining budget.
  return guardedSpend(
    options,
    { ...request, amount: formatFlop(raw) },
    {
      binding: {
        type: "direct-session",
        ...session,
        estimate: estimateInput,
        source: input.source,
        measuredAt: input.measuredAt,
        agent: signer.address,
        genesisHash: permit.genesisHash,
        maxFlop: raw,
      },
      execute: () =>
        sdk.runDirectSession({
          ...session,
          api,
          signer,
          maxFlop: raw,
          indexerUrl: session.indexerUrl ?? "https://explorer.devnet.flop.network",
        } as O), // Reconstruct the inferred SDK options with only maxFlop and default indexer overridden.
      channelId: (result) => {
        if (
          !(result.channelId instanceof Uint8Array) ||
          result.channelId.length !== 32 ||
          result.miner !== session.miner
        )
          throw new Error("Invalid SDK session result");
        return `0x${Buffer.from(result.channelId).toString("hex")}`;
      },
    },
    mode,
  );
}

export type WalletMove = { kind: "fund" | "transfer" | "withdraw"; destination: string };
export interface WalletPort<A extends GenesisApi, S extends AddressSigner> {
  fundAgentWallet(api: A, signer: S, agent: string, amount: bigint): Promise<string>;
  agentTransfer(api: A, signer: S, destination: string, amount: bigint): Promise<string>;
  ownerWithdraw(api: A, signer: S, agent: string, amount: bigint): Promise<string>;
}
/**
 * Guard the SDK's explicit amount-moving wallet calls. Model must be wallet:<kind>.
 * Wallet outcomes remain charged; a returned transaction hash does not establish finality.
 * @example await guardedWalletMove(guard, request, api, signer, move, permit, { dryRun: true }, sdk)
 */
export async function guardedWalletMove<A extends GenesisApi, S extends AddressSigner>(
  options: GuardOptions,
  input: SpendRequest,
  api: A,
  signer: S,
  inputMove: WalletMove,
  permit: DevnetPermit,
  mode: { dryRun: boolean },
  sdk: WalletPort<A, S>,
) {
  const request = structuredClone(input),
    move = structuredClone(inputMove);
  const raw = parseFlop(request.amount);
  permitSpend(api, permit, raw);
  if (
    !["fund", "transfer", "withdraw"].includes(move.kind) ||
    request.miner !== move.destination ||
    request.model !== `wallet:${move.kind}` ||
    parseFlop(request.pricePerGflop) !== 0n
  )
    throw new Error("Wallet request must bind its operation and destination");
  return guardedSpend(
    options,
    request,
    {
      binding: { ...move, agent: signer.address, genesisHash: permit.genesisHash, amount: raw },
      execute: async () => {
        if (move.kind === "fund") return sdk.fundAgentWallet(api, signer, move.destination, raw);
        if (move.kind === "withdraw") return sdk.ownerWithdraw(api, signer, move.destination, raw);
        return sdk.agentTransfer(api, signer, move.destination, raw);
      },
      channelId: (hash) => {
        if (typeof hash !== "string" || !/^0x[a-f0-9]{64}$/i.test(hash))
          throw new Error("Invalid SDK transaction hash");
        return null;
      },
    },
    mode,
  );
}

/** Minimal finalized-state read port, derived from the SDK's polkadot API usage. */
export interface FinalityPort {
  finalizedHead(): Promise<{ hash: string; number: bigint }>;
  block(
    hash: string,
  ): Promise<{ hash: string; number: bigint; canonicalHash: string; state: unknown; events: unknown }>;
}
interface FinalEvent {
  section: string;
  method: string;
  data: Record<string, unknown>;
}
/** Read methods used by the SDK's polkadot connection. Codec values are validated at the boundary. */
export interface FinalityApi {
  rpc: {
    chain: {
      getFinalizedHead(): Promise<{ toHex(): string }>;
      getHeader(hash: string): Promise<{ number: { toString(): string } }>;
      getBlockHash(number: string): Promise<{ toHex(): string }>;
    };
  };
  at(hash: string): Promise<{
    query: {
      computeChannel?: { channels?: (id: string) => Promise<unknown> };
      system?: { events?: () => Promise<unknown> };
    };
  }>;
}
/**
 * Read a canonical finalized block and a Closed channel before recording settlement or full refund.
 * Source must name the trusted devnet RPC; indexer rows alone are not finality evidence.
 * @example await reconcileChannel(guard, id, blockHash, rpcSource, port)
 */
export async function reconcileChannel(
  options: GuardOptions,
  id: string,
  blockHash: string,
  source: string,
  port: FinalityPort,
): Promise<"settled" | "refunded"> {
  if (!/^0x[a-f0-9]{64}$/i.test(blockHash) || !source.trim()) throw new Error("Block hash and source required");
  const state = await options.ledger.verify();
  const reservation = state.reservations.find((r) => r.request.id === id);
  const outcome = state.events.find((e) => e.kind === "outcome" && e.id === id);
  if (!reservation?.pending || outcome?.kind !== "outcome" || !outcome.channelId)
    throw new Error("Pending channel-bound reservation required");
  const [head, block] = await Promise.all([port.finalizedHead(), port.block(blockHash)]);
  if (
    typeof head.number !== "bigint" ||
    typeof block.number !== "bigint" ||
    block.number < 0n ||
    block.number > head.number ||
    !/^0x[a-f0-9]{64}$/i.test(head.hash) ||
    block.hash !== blockHash ||
    block.canonicalHash !== blockHash
  )
    throw new Error("Block is not canonical and finalized");
  if (!block.state || typeof block.state !== "object") throw new Error("Channel state missing");
  const channel = block.state as Record<string, unknown>;
  if (
    channel.channelId !== outcome.channelId ||
    channel.state !== "Closed" ||
    channel.miner !== reservation.request.miner
  )
    throw new Error("Finalized Closed channel identity required");
  if (!Array.isArray(block.events)) throw new Error("Invalid finalized events");
  const matches = block.events.filter((e: unknown): e is FinalEvent => {
    if (!e || typeof e !== "object") return false;
    const event = e as Partial<FinalEvent>;
    return (
      event.section === "computeChannel" &&
      typeof event.method === "string" &&
      ["ForceOpenExpired", "TimedOutRefunded", "Settled"].includes(event.method) &&
      !!event.data &&
      event.data.channelId === outcome.channelId
    );
  });
  if (matches.length !== 1) throw new Error("One matching finalized outcome event required");
  const event = matches[0]!;
  const refund = event.method !== "Settled";
  if (
    refund &&
    (typeof event.data.refunded !== "string" ||
      !/^[0-9]+$/.test(event.data.refunded) ||
      BigInt(event.data.refunded) !== BigInt(reservation.charged))
  )
    throw new Error("Full refund amount must match reservation");
  await options.ledger.transact((latest) => ({
    events: [
      {
        kind: refund ? "refund" : "settled",
        at: Math.max((options.now ?? Date.now)(), latest.events.at(-1)?.at ?? 0),
        id,
        channelId: outcome.channelId!,
        blockHash,
        source,
        ...(refund ? { amountRaw: reservation.charged } : {}),
      } as import("./ledger").AuditEvent,
    ],
    value: undefined,
  }));
  return refund ? "refunded" : "settled";
}

/**
 * Build the finality reader from the SDK's API connection, pinned to one channel.
 * Each reconciliation reads fresh state. It does not cache or retry write operations.
 * @example const port = sdkFinalityPort(api, channelId)
 */
export function sdkFinalityPort(api: FinalityApi, channelId: string): FinalityPort {
  return {
    async finalizedHead() {
      const hash = await api.rpc.chain.getFinalizedHead();
      const header = await api.rpc.chain.getHeader(hash.toHex());
      return { hash: hash.toHex(), number: BigInt(header.number.toString()) };
    },
    async block(hash) {
      const header = await api.rpc.chain.getHeader(hash);
      const canonical = await api.rpc.chain.getBlockHash(header.number.toString());
      const at = await api.at(hash);
      const channels = at.query.computeChannel?.channels;
      const eventsQuery = at.query.system?.events;
      if (!channels || !eventsQuery) throw new Error("Channel or events storage unavailable");
      const raw: unknown = await channels(channelId);
      // The SDK uses Option<Channel> here. Validate before accessing codec methods.
      if (
        !raw ||
        typeof raw !== "object" ||
        !("isSome" in raw) ||
        raw.isSome !== true ||
        !("unwrap" in raw) ||
        typeof raw.unwrap !== "function"
      )
        throw new Error("Channel unavailable");
      const channel: unknown = raw.unwrap();
      if (!channel || typeof channel !== "object" || !("state" in channel) || !("miner" in channel))
        throw new Error("Malformed channel storage");
      const records = await eventsQuery();
      const events = Array.from(
        records as unknown as Iterable<{
          event: {
            section: string;
            method: string;
            data: Iterable<{ toString(): string }>;
            meta: { fields: Iterable<{ name: { isSome: boolean; unwrap(): { toString(): string } } }> };
          };
        }>,
      ).map(({ event }) => {
        const fields = Array.from(event.meta.fields, (f) =>
          f.name.isSome
            ? f.name
                .unwrap()
                .toString()
                .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
            : "",
        );
        const data = Object.fromEntries(Array.from(event.data, (value, i) => [fields[i] ?? "", value.toString()]));
        return { section: event.section, method: event.method, data };
      });
      return {
        hash,
        number: BigInt(header.number.toString()),
        canonicalHash: canonical.toHex(),
        state: { channelId, state: String(channel.state), miner: String(channel.miner) },
        events,
      };
    },
  };
}
