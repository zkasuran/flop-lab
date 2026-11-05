// SPDX-License-Identifier: Apache-2.0
import { escrowConserved, type Settlement } from "../../mcp/src/index";
import { parseSnapshot, parseModels, parseSettlements, parsePage, type Snapshot } from "./schema";

export const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_WEIGHTS: Readonly<{ cooperative: number; recency: number }> = Object.freeze({
  cooperative: 70,
  recency: 30,
});
export interface RankOptions {
  now?: number;
  windowMs?: number;
  weights?: typeof DEFAULT_WEIGHTS;
}
export interface RankedMiner {
  miner: string;
  score: number | null;
  confidence: number;
  confidenceLabel: "none" | "low" | "medium" | "high";
  settlements: number;
  distinctAgents: number;
  cooperativeShare: number | null;
  noncooperativeShare: number | null;
  unusedEscrowRatio: number | null;
  latestSettlementAt: number | null;
  historicalMedianPriceRaw: string | null;
  terms: { name: string; weight: number; value: number; contribution: number }[];
  priceSources: ReturnType<typeof parseModels>;
  provenance: { source: string; measuredAt: string }[];
  warnings: string[];
}
function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function ratio(a: bigint, b: bigint) {
  return b === 0n ? null : Number((a * 1_000_000n) / b) / 1_000_000;
}
/** Compare unsigned decimal strings without floating point loss. @example compareDecimal("1.01", "1.1") < 0 */
export function compareDecimal(a: string, b: string): number {
  const [ai = "0", af = ""] = a.split(".");
  const [bi = "0", bf = ""] = b.split(".");
  const scale = Math.max(af.length, bf.length);
  const av = BigInt(ai + af.padEnd(scale, "0"));
  const bv = BigInt(bi + bf.padEnd(scale, "0"));
  return av < bv ? -1 : av > bv ? 1 : 0;
}

/** Rank observed settlement history. The score is not uptime. @example rankSnapshot(snapshot, { now: Date.now() }) */
export function rankSnapshot(input: Snapshot, options: RankOptions = {}): RankedMiner[] {
  const snapshot = parseSnapshot(input);
  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? WINDOW_MS;
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  if (!Number.isFinite(now) || !Number.isFinite(windowMs) || windowMs <= 0)
    throw new Error("invalid scoring time or window");
  if (
    Object.values(weights).some((w) => !Number.isFinite(w) || w < 0) ||
    !Number.isFinite(weights.cooperative + weights.recency) ||
    weights.cooperative + weights.recency <= 0
  )
    throw new Error("invalid weights");
  const modelRecord = snapshot.records.find((r) => r.kind === "models")!;
  const settlementRecord = snapshot.records.find((r) => r.kind === "settlements")!;
  const prices = parseModels(modelRecord);
  const all = parseSettlements(settlementRecord);
  const page = parsePage(settlementRecord.raw);
  const incomplete = page.hasMore || page.offset !== 0 || page.data.length < page.total;
  const miners = new Set([...prices.map((p) => p.miner), ...all.map((s) => s.miner)]);
  const rows: RankedMiner[] = [];
  for (const miner of miners) {
    const observed = all.filter((s) => s.miner === miner);
    const inWindow = observed.filter(
      (s) =>
        s.settledAt <= now && s.settledAt >= now - windowMs && s.settledAt <= Date.parse(settlementRecord.measuredAt),
    );
    const eligible: Settlement[] = inWindow.filter((s) => !s.selfTrade && s.agent !== s.miner && escrowConserved(s));
    const n = eligible.length;
    const agents = new Set(eligible.map((s) => s.agent)).size;
    const confidence = Math.min(incomplete ? 0.5 : 1, (n / (n + 20)) * Math.min(1, agents / 5));
    const latest = n ? Math.max(...eligible.map((s) => s.settledAt)) : null;
    const cooperative = n ? eligible.filter((s) => s.cooperative).length / n : null;
    const recency = latest === null ? 0 : Math.max(0, 1 - (now - latest) / windowMs);
    const sum = weights.cooperative + weights.recency;
    const terms = [
      {
        name: "cooperative",
        weight: weights.cooperative / sum,
        value: cooperative ?? 0,
        contribution: 100 * confidence * (weights.cooperative / sum) * (cooperative ?? 0),
      },
      {
        name: "recency",
        weight: weights.recency / sum,
        value: recency,
        contribution: 100 * confidence * (weights.recency / sum) * recency,
      },
    ];
    const historic = eligible
      .filter((s) => BigInt(s.aggregateGn) > 0n)
      .map((s) => s.pricePerGflop)
      .sort(compareDecimal);
    const priceSources = prices.filter((p) => p.miner === miner);
    const warnings = ["Settlement history spans models. It does not measure uptime, latency or verified inference."];
    if (incomplete)
      warnings.push(
        `Partial settlement tape: ${page.data.length} of ${page.total} reported rows. Confidence capped at 0.5.`,
      );
    if (n === 0) warnings.push("No usable settlements in the window. No score.");
    if (inWindow.length > n) warnings.push(`${inWindow.length - n} self-trade or nonconserving rows excluded.`);
    if (priceSources.some((p) => p.source === "devnet-nominal"))
      warnings.push("devnet-nominal listing. No live per-GFLOP quote. Listing does not affect score.");
    if (priceSources.some((p) => now >= Date.parse(p.expiresAt))) warnings.push("Expired gateway price source.");
    rows.push({
      miner,
      score: n ? terms.reduce((sum, term) => sum + term.contribution, 0) : null,
      confidence,
      confidenceLabel: n === 0 ? "none" : confidence < 0.5 ? "low" : confidence < 0.8 ? "medium" : "high",
      settlements: n,
      distinctAgents: agents,
      cooperativeShare: cooperative,
      noncooperativeShare: cooperative === null ? null : 1 - cooperative,
      unusedEscrowRatio: ratio(
        eligible.reduce((sum, s) => sum + BigInt(s.unusedEscrow), 0n),
        eligible.reduce((sum, s) => sum + BigInt(s.escrow), 0n),
      ),
      latestSettlementAt: latest,
      historicalMedianPriceRaw: historic[Math.floor((historic.length - 1) / 2)] ?? null,
      terms,
      priceSources,
      provenance: [modelRecord, settlementRecord].map(({ source, measuredAt }) => ({ source, measuredAt })),
      warnings,
    });
  }
  return rows.sort(
    (a, b) => (b.score ?? -1) - (a.score ?? -1) || b.confidence - a.confidence || compareText(a.miner, b.miner),
  );
}

/** Move each weight by 10 percent and report actual position changes. @example sensitivity(snapshot, { now }) */
export function sensitivity(snapshot: Snapshot, options: RankOptions = {}) {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const baseline = rankSnapshot(snapshot, options).map((r) => r.miner);
  return (Object.keys(weights) as (keyof typeof weights)[]).flatMap((term) =>
    [0.9, 1.1].map((factor) => {
      const ranked = rankSnapshot(snapshot, { ...options, weights: { ...weights, [term]: weights[term] * factor } });
      return {
        term,
        factor,
        moves: ranked.flatMap((row, i) =>
          baseline.indexOf(row.miner) === i
            ? []
            : [{ miner: row.miner, from: baseline.indexOf(row.miner) + 1, to: i + 1 }],
        ),
      };
    }),
  );
}
