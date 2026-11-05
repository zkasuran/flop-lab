// SPDX-License-Identifier: Apache-2.0
import { escrowConserved, type Settlement } from "../../mcp/src/index";
import { parseSnapshot, parseModels, parseSettlements, parsePage, type Snapshot } from "./schema";
import { parseReliability, scoreReliability, type MinerReliability } from "./reliability";
import { genesisHash, type SettlementHistory } from "./archive";

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
  terms: { name: string; weight: number; value: number | null; contribution: number }[];
  scoreVersion: "settlement-v1" | "evidence-v2";
  reliability: MinerReliability;
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
  return rankValidated(snapshot, options);
}

/** Score each archive sample separately, including when genesis is unknown. @example rankRecordedHistory(snapshot) */
export function rankRecordedHistory(input: Snapshot) {
  const snapshot = parseSnapshot(input);
  return (snapshot.archive?.snapshots ?? []).map((record) => ({
    source: record.source,
    measuredAt: record.measuredAt,
    genesis: record.genesis,
    rows: rankValidated(snapshot, { now: Date.parse(record.measuredAt) }, record),
  }));
}

function rankValidated(snapshot: Snapshot, options: RankOptions, archived?: SettlementHistory): RankedMiner[] {
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
  const settlementRecord = archived
    ? { ...archived, kind: "settlements" as const }
    : snapshot.records.find((r) => r.kind === "settlements")!;
  const prices = archived ? [] : parseModels(modelRecord);
  const genesis = genesisHash(snapshot.records.find((r) => r.kind === "indexer")!.raw);
  const history = (archived ? [] : (snapshot.archive?.snapshots ?? [])).filter(
    (s) =>
      genesis !== null &&
      s.genesis === genesis &&
      Date.parse(s.measuredAt) <= Date.parse(snapshot.measuredAt) &&
      Date.parse(s.measuredAt) <= now &&
      Date.parse(s.measuredAt) >= now - windowMs,
  );
  const byChannel = new Map<string, Settlement>();
  for (const record of [...history].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt))) {
    for (const row of parseSettlements({ ...record, kind: "settlements" }))
      if (row.settledAt <= Date.parse(record.measuredAt)) byChannel.set(row.channelId, row);
  }
  for (const row of parseSettlements(settlementRecord)) byChannel.set(row.channelId, row);
  const all = [...byChannel.values()];
  const page = parsePage(settlementRecord.raw);
  const incomplete = history.length > 0 || page.hasMore || page.offset !== 0 || page.data.length < page.total;
  const view = !archived && snapshot.reliability ? parseReliability(snapshot.reliability) : undefined;
  const v2 = !archived && (!!view || !!snapshot.reliabilityError);
  const miners = new Set([
    ...prices.map((p) => p.miner),
    ...all.map((s) => s.miner),
    ...(view?.evidence.miners ?? []),
    ...(view?.proofs.map((p) => p.submitter) ?? []),
    ...(view?.events.flatMap((e) => (e.miner === null ? [] : [e.miner])) ?? []),
    ...(view?.ghosts.map((e) => e.miner) ?? []),
  ]);
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
    let terms: RankedMiner["terms"] = [
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
    const reliability = scoreReliability(view, miner, now, windowMs);
    if (v2)
      terms = [
        ...terms.map((t) => ({ ...t, weight: t.weight * 0.5, contribution: t.contribution * 0.5 })),
        ...reliability.terms,
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
    if (n === 0) warnings.push("No usable settlements in the window.");
    if (v2) warnings.push(...reliability.warnings);
    if (!archived && snapshot.reliabilityError) warnings.push(`Reliability unavailable: ${snapshot.reliabilityError}`);
    if (history.length)
      warnings.push(
        `Settlement history includes ${history.length} recorder snapshots with matching observed genesis. Channels are deduplicated.`,
      );
    if (!archived && snapshot.archive && !history.length)
      warnings.push("No matching recorder settlement history. Reliability uses the indexer series.");
    if (inWindow.length > n) warnings.push(`${inWindow.length - n} self-trade or nonconserving rows excluded.`);
    if (priceSources.some((p) => p.source === "devnet-nominal"))
      warnings.push("devnet-nominal listing. No live per-GFLOP quote. Listing does not affect score.");
    if (priceSources.some((p) => now >= Date.parse(p.expiresAt))) warnings.push("Expired gateway price source.");
    rows.push({
      miner,
      score:
        n || (v2 && reliability.terms.some((t) => t.value !== null))
          ? terms.reduce((sum, term) => sum + term.contribution, 0)
          : null,
      scoreVersion: v2 ? "evidence-v2" : "settlement-v1",
      reliability,
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
      provenance: [
        ...(archived ? [] : [modelRecord]),
        settlementRecord,
        ...history,
        ...(view ? [view.evidence] : []),
      ].map(({ source, measuredAt }) => ({ source, measuredAt })),
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
