// SPDX-License-Identifier: Apache-2.0
import type { Settlement } from "@flop-lab/mcp";
import type { Priority, Signal, Tape, WatchReport, WindowEstimate } from "./types";
import { decimal, timestamp } from "./validation";

export const CHALLENGE_DOC = "https://docs.flop.network/docs/verification-stack";
export const SDK_CHAIN_SOURCE = "https://unpkg.com/@flop-labs/sdk@0.4.0/dist/compute-channel/chain.d.ts";
export const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const ASSUMPTIONS = [
  `Estimated window: seven wall-clock days only for an explicit SettlementPosted observation. Source: ${CHALLENGE_DOC}, read 2026-11-05. The docs say approximately seven days and draft design.`,
  `SDK 0.4.0 says cooperative settle has no standard dispute window. forceSettle opens a window and finalize pays after it closes. Source: ${SDK_CHAIN_SOURCE}. Other audit lanes are not established here.`,
  "The exact runtime duration and challengeEnd are not verified. A final payout timestamp is not a challenge start. Estimated expiry is not a filing deadline or a claim of eligibility.",
  "The capacity-bond revocation constant is not used as a challenge deadline. Block cadence is measured separately and does not set the window.",
  "Settlement timestamps and hashes come from the hosted indexer. Finality is not independently verified. Pages are not an atomic snapshot.",
  "Review priority is a policy over observed tape fields, not a fraud probability. Miner stake and slashing history are not observed.",
];

/** Estimate a draft window at an explicit time. @example estimateWindow(row, Date.now()) */
export function estimateWindow(row: Settlement, now: number): WindowEstimate {
  timestamp(now, "now");
  timestamp(row.settledAt, "settledAt");
  if (row.settledAt > now)
    return {
      status: "unknown",
      estimatedExpiry: null,
      remainingMs: null,
      reason: "Settlement timestamp is in the future relative to evaluation time.",
    };
  if (row.cooperative && row.settlementEvent === "computeChannel.Settled")
    return {
      status: "no-standard-window",
      estimatedExpiry: null,
      remainingMs: null,
      reason:
        "SDK 0.4.0 documents cooperative settle as immediate payout without the standard dispute window. Other audit lanes are not established by this tape.",
    };
  if (row.cooperative || row.settlementEvent !== "computeChannel.SettlementPosted")
    return {
      status: "unknown",
      estimatedExpiry: null,
      remainingMs: null,
      reason:
        "No unambiguous force-settlement posting timestamp or challengeEnd is present. Final payout must not start a new estimated window.",
    };
  const expiry = row.settledAt + WINDOW_MS;
  return {
    status: now < expiry ? "estimated-open" : "estimated-expired",
    estimatedExpiry: new Date(expiry).toISOString(),
    remainingMs: Math.max(0, expiry - now),
    reason: "Draft seven-day assumption. Actual runtime expiry is unverified.",
  };
}

function portion(n: bigint, d: bigint, maximum: number): number {
  if (d <= 0n) return 0;
  return Number((n * BigInt(maximum) * 100n) / d) / 100;
}

/** Rank attention using documented policy weights. Missing signals earn no points. @example prioritize(row, tape) */
export function prioritize(row: Settlement, tape: Tape): Priority {
  const all = tape.settlements;
  const maxPaid = all.reduce((max, s) => (BigInt(s.minerPaid) > max ? BigInt(s.minerPaid) : max), 0n);
  const prior = all.filter(
    (s) =>
      s.channelId !== row.channelId &&
      s.miner === row.miner &&
      s.settledBlock < row.settledBlock &&
      s.settledAt <= row.settledAt,
  );
  const forced = prior.filter((s) => !s.cooperative).length;
  const peers =
    row.modelHash === null || row.assuranceTier === null
      ? []
      : all.filter(
          (s) =>
            s.channelId !== row.channelId &&
            s.modelHash === row.modelHash &&
            s.assuranceTier === row.assuranceTier &&
            s.marketKind === row.marketKind &&
            s.gpuSku === row.gpuSku &&
            BigInt(s.aggregateGn) > 0n,
        );
  const prices = peers
    .map((s) => decimal(s.pricePerGflop))
    .sort((a, b) => (a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0));
  const median = prices[Math.floor(prices.length / 2)];
  const price = decimal(row.pricePerGflop);
  const usablePrice = prices.length >= 3 && median !== undefined && median.n > 0n && BigInt(row.aggregateGn) > 0n;
  const tier = row.assuranceTier?.toLowerCase();
  const escrow = BigInt(row.escrow);
  const unused = BigInt(row.unusedEscrow);
  const signals: Signal[] = [
    {
      name: "Payment exposure",
      points: maxPaid > 0n ? portion(BigInt(row.minerPaid), maxPaid, 25) : null,
      maximum: 25,
      reason: "25 * minerPaid / maximum minerPaid in this tape. This is payment exposure, not miner stake.",
    },
    {
      name: "Non-cooperative settlement",
      points: row.cooperative ? 0 : 20,
      maximum: 20,
      reason: "20 when cooperative is false. This alone does not imply wrongdoing.",
    },
    {
      name: "Unused escrow",
      points: escrow > 0n && unused <= escrow ? portion(unused, escrow, 15) : null,
      maximum: 15,
      reason: "15 * unusedEscrow / escrow. Undefined for zero escrow or inconsistent amounts.",
    },
    {
      name: "Reported assurance tier",
      points: tier === "soft" ? 10 : tier === "hard" ? 0 : null,
      maximum: 10,
      reason: "Soft: 10. Hard: 0. Other or absent: unavailable. No attestation is verified.",
    },
    {
      name: "Prior miner non-cooperation",
      points: prior.length ? portion(BigInt(forced), BigInt(prior.length), 15) : null,
      maximum: 15,
      reason: `15 * prior non-cooperative / prior observed settlements: ${forced}/${prior.length}. Strictly earlier blocks only.`,
    },
    {
      name: "Comparable price outlier",
      points: usablePrice ? (price.n * median.d > 2n * median.n * price.d ? 15 : 0) : null,
      maximum: 15,
      reason: `15 above twice the upper median of at least three other nonzero-compute rows with matching model, tier, market and GPU SKU. Observed peers: ${peers.length}.`,
    },
  ];
  const available = signals.filter((s) => s.points !== null).length;
  return {
    score: Math.round(signals.reduce((sum, s) => sum + (s.points ?? 0), 0) * 100) / 100,
    maximum: 100,
    signals,
    confidence: {
      availableSignals: available,
      totalSignals: signals.length,
      tapeComplete: tape.coverage.complete,
      label: "Field coverage only. Not statistical confidence or a fraud probability.",
    },
    priorMinerSettlements: prior.length,
    comparablePricePeers: peers.length,
  };
}

/** Build an urgency-sorted report from dated observations. @example analyze(tape, Date.now()) */
export function analyze(tape: Tape, now: number): WatchReport {
  timestamp(now, "now");
  const samples = [...tape.blocks].sort((a, b) => a.value.number - b.value.number);
  const first = samples[0];
  const last = samples.at(-1);
  const intervals = first && last ? last.value.number - first.value.number : 0;
  const delta = first && last ? last.value.timestamp - first.value.timestamp : 0;
  const blockCadence = intervals > 0 && delta > 0 ? { milliseconds: delta / intervals, intervals, samples } : null;
  const order = { "estimated-open": 0, unknown: 1, "estimated-expired": 2, "no-standard-window": 3 };
  const rows = tape.settlements.map((settlement) => ({
    settlement,
    window: estimateWindow(settlement, now),
    priority: prioritize(settlement, tape),
    measuredAt: tape.rowMeasuredAt[settlement.channelId] ?? tape.measuredAt,
    source: tape.source,
  }));
  rows.sort(
    (a, b) =>
      order[a.window.status] - order[b.window.status] ||
      (a.window.remainingMs ?? Infinity) - (b.window.remainingMs ?? Infinity) ||
      b.priority.score - a.priority.score ||
      a.settlement.channelId.localeCompare(b.settlement.channelId),
  );
  return { tape, evaluatedAt: new Date(now).toISOString(), assumptions: [...ASSUMPTIONS], blockCadence, rows };
}

/** Format raw 18-decimal units without rounding through Number. @example formatFlop("1000000000000000001") */
export function formatFlop(raw: string): string {
  if (!/^\d{1,100}$/.test(raw)) throw new Error("Expected nonnegative integer units");
  const n = BigInt(raw);
  const fraction = (n % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return `${n / 10n ** 18n}${fraction ? `.${fraction}` : ""}`;
}
