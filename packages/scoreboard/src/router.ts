// SPDX-License-Identifier: Apache-2.0
import { decimal, type Snapshot } from "./schema";
import { rankSnapshot, type RankedMiner } from "./scoring";

export interface RouteOptions {
  model: string;
  /** FLOP per GFLOP. Unknown live prices fail a supplied ceiling. */
  maxPricePerGflop?: string;
  minConfidence?: number;
  exclude?: string[];
  now?: number;
  /** Minimum observed acknowledgement ratio. Missing observations refuse. */
  minReliability?: number;
  minReliabilityOutcomes?: number;
  minProofs?: number;
  rejectGhostFailures?: boolean;
  maxReliabilityAgeMs?: number;
}
export type Rejection =
  | "excluded"
  | "model-not-listed"
  | "price-source-expired"
  | "price-source-not-effective"
  | "price-source-measured-in-future"
  | "confidence-too-low"
  | "no-settlement-evidence"
  | "reliability-unavailable"
  | "reliability-too-low"
  | "reliability-sample-too-small"
  | "reliability-stale"
  | "ghost-failure-observed"
  | "ghost-evidence-unavailable"
  | "proof-activity-unavailable"
  | "proof-activity-too-low"
  | "live-price-unknown";
export type RouteResult =
  | {
      status: "picked";
      miner: string;
      explanation: {
        score: number;
        confidence: number;
        model: string;
        priceSource: string;
        quotedPricePerGflop: null;
        reasons: string[];
        warnings: string[];
      };
      candidates: Candidate[];
    }
  | { status: "no-eligible-miner"; reasons: string[]; candidates: Candidate[] };
export interface Candidate {
  miner: string;
  reasons: Rejection[];
}

/** Choose only a currently listed miner with settlement evidence. @example pickMiner(snapshot, { model: "qwen/qwen2.5-0.5b-instruct", minConfidence: 0.2 }) */
export function pickMiner(snapshot: Snapshot, options: RouteOptions): RouteResult {
  const now = options.now ?? Date.now();
  const min = options.minConfidence ?? 0.2;
  if (
    typeof options.model !== "string" ||
    options.model.length === 0 ||
    !Number.isFinite(now) ||
    !Number.isFinite(min) ||
    min < 0 ||
    min > 1
  )
    throw new Error("invalid route policy");
  if (options.maxPricePerGflop !== undefined) decimal(options.maxPricePerGflop, "maxPricePerGflop");
  if (
    options.minReliability !== undefined &&
    (!Number.isFinite(options.minReliability) || options.minReliability < 0 || options.minReliability > 1)
  )
    throw new Error("invalid reliability threshold");
  for (const v of [options.minReliabilityOutcomes, options.minProofs, options.maxReliabilityAgeMs])
    if (v !== undefined && (!Number.isSafeInteger(v) || v < 0))
      throw new Error("invalid reliability policy count or age");
  if (options.rejectGhostFailures !== undefined && typeof options.rejectGhostFailures !== "boolean")
    throw new Error("invalid ghost policy");
  const rows = rankSnapshot(snapshot, { now });
  const candidates: Candidate[] = rows.map((row) => {
    const reasons: Rejection[] = [];
    if (options.exclude?.includes(row.miner)) reasons.push("excluded");
    const price = row.priceSources.find((p) => p.model === options.model);
    if (!price) reasons.push("model-not-listed");
    else {
      if (now >= Date.parse(price.expiresAt)) reasons.push("price-source-expired");
      if (now < Date.parse(price.effectiveAt)) reasons.push("price-source-not-effective");
      if (now < Date.parse(price.provenance.measuredAt)) reasons.push("price-source-measured-in-future");
    }
    if (row.confidence < min) reasons.push("confidence-too-low");
    if (row.settlements === 0) reasons.push("no-settlement-evidence");
    const r = row.reliability;
    const requiresReliability =
      options.minReliability !== undefined ||
      options.minReliabilityOutcomes !== undefined ||
      options.minProofs !== undefined ||
      options.rejectGhostFailures ||
      options.maxReliabilityAgeMs !== undefined;
    if (requiresReliability && (r.measuredAt === null || now < Date.parse(r.measuredAt)))
      reasons.push("reliability-unavailable");
    if (
      requiresReliability &&
      r.measuredAt !== null &&
      now - Date.parse(r.measuredAt) > (options.maxReliabilityAgeMs ?? 86_400_000)
    )
      reasons.push("reliability-stale");
    if (options.minReliability !== undefined) {
      if (r.acknowledgements === null) reasons.push("reliability-unavailable");
      else if (r.acknowledgements < options.minReliability) reasons.push("reliability-too-low");
    }
    if (r.acknowledgementOutcomes < (options.minReliabilityOutcomes ?? (options.minReliability === undefined ? 0 : 5)))
      reasons.push("reliability-sample-too-small");
    if (options.rejectGhostFailures) {
      if (r.ghostStatus === "unknown") reasons.push("ghost-evidence-unavailable");
      if (r.ghostStatus === "failure-observed") reasons.push("ghost-failure-observed");
    }
    if (options.minProofs !== undefined) {
      if (r.proofs === null) reasons.push("proof-activity-unavailable");
      else if (r.proofs < options.minProofs) reasons.push("proof-activity-too-low");
    }
    // The recorded gateway schema has token prices, not per-GFLOP quotes.
    // A historical settlement is never substituted for a live spending constraint.
    if (options.maxPricePerGflop !== undefined) reasons.push("live-price-unknown");
    return { miner: row.miner, reasons: [...new Set(reasons)] };
  });
  const eligible = candidates.find((candidate) => candidate.reasons.length === 0);
  if (!eligible)
    return {
      status: "no-eligible-miner",
      reasons: rows.length ? ["Every observed candidate failed the policy."] : ["No observed miners."],
      candidates,
    };
  const row = rows.find((r) => r.miner === eligible.miner) as RankedMiner;
  const source = row.priceSources.find((p) => p.model === options.model)!;
  return {
    status: "picked",
    miner: row.miner,
    explanation: {
      score: row.score!,
      confidence: row.confidence,
      model: options.model,
      priceSource: source.source,
      quotedPricePerGflop: null,
      reasons: [
        `Highest eligible ${row.scoreVersion} score; ties use settlement confidence then address.`,
        "Gateway listing is effective and unexpired.",
        "No price ceiling was requested. This is a discovery recommendation, not a price guarantee.",
      ],
      warnings: row.warnings,
    },
    candidates,
  };
}
