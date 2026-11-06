// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import type { CallResult } from "@flop-lab/mcp";
import { parseSnapshot, pickMiner, rankSnapshot } from "@flop-lab/scoreboard";
import { FileLedger, guardedSpend, parseFlop } from "@flop-lab/spendguard";
import { parseEvidence, verifyEvidence } from "@flop-lab/verifier";
import { assertDevnet, discoverModels, policyFor } from "./guards";

export interface Sources {
  health(): Promise<CallResult<unknown>>;
  discover(): Promise<CallResult<unknown>>;
  snapshot(): Promise<unknown>;
  settlement(channelId: string): Promise<unknown>;
}
export interface Quote {
  model: string;
  miner: string;
  maxFlop: string;
  pricePerGflop: string;
  expiresAt: string;
}
export interface TurnOptions {
  sources: Sources;
  maxFlop: string;
  ledgerPath: string;
  now?: () => number;
  dryRun?: boolean;
  /** Reuse the same ID for a dry run and its matching admitted operation. */
  requestId?: string;
  quote?: Quote;
  /** Trusted adapter must enforce quote.maxFlop on chain. No adapter ships with this starter. */
  paidCall?: (quote: Readonly<Quote>) => Promise<{ channelId: string }>;
}

/** Run one bounded agent turn. The default is a dry run. Example: await runTurn(options). */
export async function runTurn(options: TurnOptions) {
  const now = options.now ?? Date.now;
  const dryRun = options.dryRun ?? true;
  if (typeof dryRun !== "boolean") throw new Error("Invalid dry-run mode");
  // Validate the ceiling even when discovery is empty.
  policyFor(options.maxFlop, "pending", "pending");
  const health = await options.sources.health();
  assertDevnet(health.value, health.measuredAt, now());
  const discovery = await options.sources.discover();
  const models = discoverModels(discovery.value);
  const snapshot = parseSnapshot(await options.sources.snapshot());
  const provenance = {
    health: health.measuredAt,
    discovery: discovery.measuredAt,
    snapshot: snapshot.measuredAt,
    sources: snapshot.records.map(({ source, measuredAt }) => ({ source, measuredAt })),
  };
  const routes = models
    .filter((model) => model.miners.length)
    .map((model) =>
      pickMiner(snapshot, {
        model: model.model,
        exclude: rankSnapshot(snapshot, { now: now() })
          .filter((row) => !model.miners.includes(row.miner))
          .map((row) => row.miner),
        now: now(),
      }),
    );
  const route = routes.find((candidate) => candidate.status === "picked");
  if (!route || route.status !== "picked") return { status: "no-eligible-miner", routes, provenance };
  const quote = options.quote ? structuredClone(options.quote) : undefined;
  if (!quote)
    return {
      status: "quote-required",
      route,
      provenance,
      note: "Discovery is not a spending quote. No paid call was made.",
    };
  if (
    quote.model !== route.explanation.model ||
    quote.miner !== route.miner ||
    !Number.isFinite(Date.parse(quote.expiresAt)) ||
    Date.parse(quote.expiresAt) <= now() ||
    parseFlop(quote.maxFlop) > parseFlop(options.maxFlop)
  )
    throw new Error("Quote does not match this route, expiry or max-flop ceiling");
  const policy = policyFor(options.maxFlop, quote.model, quote.miner);
  const guarded = await guardedSpend(
    { policy, ledger: new FileLedger(options.ledgerPath), now },
    {
      id: options.requestId ?? randomUUID(),
      task: "agent-turn",
      model: quote.model,
      miner: quote.miner,
      amount: quote.maxFlop,
      pricePerGflop: quote.pricePerGflop,
      at: now(),
      dryRun,
    },
    {
      binding: quote,
      execute: async () => {
        // Recheck immediately before invoking an adapter after policy admission.
        const latest = await options.sources.health();
        assertDevnet(latest.value, latest.measuredAt, now());
        if (Date.parse(quote.expiresAt) <= now()) throw new Error("Quote expired before execution");
        if (!options.paidCall) throw new Error("Paid transport is not installed. This starter ships read-only.");
        const result = await options.paidCall(Object.freeze(quote));
        if (!/^0x[0-9a-f]{64}$/i.test(result.channelId)) throw new Error("Invalid result channel ID");
        return result;
      },
      channelId: (result) => result.channelId,
    },
    { dryRun },
  );
  if (guarded.status !== "returned" || !guarded.result) return { status: guarded.status, guarded, route, provenance };
  const evidence = parseEvidence(await options.sources.settlement(guarded.result.channelId));
  if (evidence.channelId.toLowerCase() !== guarded.result.channelId.toLowerCase())
    throw new Error("Settlement channel mismatch");
  const verification = await verifyEvidence(evidence);
  // Keep reservations charged. A report never silently releases the budget.
  return {
    status: verification.exitCode === 0 ? "checked" : "verification-incomplete",
    verification,
    guarded,
    route,
    provenance,
  };
}
