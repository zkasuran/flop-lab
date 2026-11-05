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
}
export type Rejection =
  | "excluded"
  | "model-not-listed"
  | "price-source-expired"
  | "price-source-not-effective"
  | "price-source-measured-in-future"
  | "confidence-too-low"
  | "no-settlement-evidence"
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
    if (row.score === null) reasons.push("no-settlement-evidence");
    // The recorded gateway schema has token prices, not per-GFLOP quotes.
    // A historical settlement is never substituted for a live spending constraint.
    if (options.maxPricePerGflop !== undefined) reasons.push("live-price-unknown");
    return { miner: row.miner, reasons };
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
        "Highest eligible settlement score; ties use confidence then address.",
        "Gateway listing is effective and unexpired.",
        "No price ceiling was requested. This is a discovery recommendation, not a price guarantee.",
      ],
      warnings: row.warnings,
    },
    candidates,
  };
}
