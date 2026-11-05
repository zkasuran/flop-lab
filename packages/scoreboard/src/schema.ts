// SPDX-License-Identifier: Apache-2.0
import { parseSettlement, type Settlement } from "@flop-lab/mcp";

export const SOURCES = {
  models: "https://api.flop.network/v1/models",
  settlements: "https://mcp.flop.network/mcp#flop_list_settlements",
  offers: "https://mcp.flop.network/mcp#flop_list_session_offers",
  leaderboard: "https://mcp.flop.network/mcp#flop_get_poui_leaderboard",
  indexer: "https://mcp.flop.network/mcp#flop_indexer_query",
} as const;
export type Surface = keyof typeof SOURCES;
export interface Observation {
  kind: Surface;
  source: string;
  measuredAt: string;
  raw: Record<string, unknown>;
}
export interface Snapshot {
  schemaVersion: 1;
  measuredAt: string;
  records: Observation[];
  collection: { requests: number; durationMs: number; cacheTtlMs: number };
}
export interface PriceSource {
  model: string;
  miner: string;
  source: string;
  effectiveAt: string;
  expiresAt: string;
  raw: Record<string, unknown>;
  provenance: { source: string; measuredAt: string };
}

export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: expected object`);
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096)
    throw new Error(`${label}: expected nonempty string`);
  return value;
}
export function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > 10_000) throw new Error(`${label}: expected bounded array`);
  return value;
}
export function timestamp(value: unknown, label: string): string {
  const s = text(value, label);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s) || !Number.isFinite(Date.parse(s)))
    throw new Error(`${label}: expected UTC timestamp`);
  return s;
}
function nonnegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`${label}: expected nonnegative number`);
  return value;
}
export function decimal(value: unknown, label: string): string {
  const s = text(value, label);
  if (!/^\d{1,80}(?:\.\d{1,80})?$/.test(s)) throw new Error(`${label}: expected unsigned decimal string`);
  return s;
}

/** Validate a recorded gateway response without inventing per-GFLOP prices. @example parseModels(record) */
export function parseModels(record: Observation): PriceSource[] {
  const models = list(record.raw.data, "models.data");
  const seen = new Set<string>();
  return models.flatMap((v) => {
    const model = object(v, "model");
    const id = text(model.id, "model.id");
    if (seen.has(id)) throw new Error(`duplicate model: ${id}`);
    seen.add(id);
    const extension = object(model["x-flop"], "model.x-flop");
    const miners = new Set<string>();
    return list(extension.price_sources, "price_sources").map((v) => {
      const raw = object(v, "price source");
      const miner = text(raw.miner_address, "miner_address");
      if (miners.has(miner)) throw new Error(`duplicate price source: ${miner}`);
      miners.add(miner);
      const effectiveAt = timestamp(raw.effective_at, "effective_at");
      const expiresAt = timestamp(raw.expires_at, "expires_at");
      if (Date.parse(expiresAt) <= Date.parse(effectiveAt))
        throw new Error("price source expiry precedes effective time");
      return {
        model: id,
        miner,
        source: text(raw.source, "price source.source"),
        effectiveAt,
        expiresAt,
        raw,
        provenance: { source: record.source, measuredAt: record.measuredAt },
      };
    });
  });
}

/** Read a bounded page and retain its coverage. @example parsePage(record.raw) */
export function parsePage(raw: Record<string, unknown>) {
  const data = list(raw.data, "page.data");
  const p = object(raw.pagination, "page.pagination");
  for (const k of ["total", "limit", "offset"] as const) {
    if (!Number.isSafeInteger(nonnegative(p[k], `pagination.${k}`))) throw new Error(`invalid pagination.${k}`);
  }
  if (typeof p.hasMore !== "boolean") throw new Error("invalid pagination.hasMore");
  const total = p.total as number;
  if (data.length > total || data.length > (p.limit as number)) throw new Error("page count mismatch");
  return { data, total, hasMore: p.hasMore, offset: p.offset as number };
}

/** Validate exact amounts and settlement facts. @example parseSettlements(record) */
export function parseSettlements(record: Observation): Settlement[] {
  const seen = new Set<string>();
  return parsePage(record.raw).data.map((value) => {
    const s = parseSettlement(value);
    if (seen.has(s.channelId)) throw new Error(`duplicate settlement: ${s.channelId}`);
    seen.add(s.channelId);
    if (
      !Number.isSafeInteger(s.settledAt) ||
      s.settledAt < 0 ||
      !Number.isSafeInteger(s.settledBlock) ||
      s.settledBlock < 0
    )
      throw new Error("invalid settlement time or block");
    decimal(s.pricePerGflop, "pricePerGflop");
    for (const value of [s.escrow, s.minerPaid, s.unusedEscrow, s.burned, s.aggregateGn]) {
      if (value.length > 80) throw new Error("settlement amount exceeds supported precision");
    }
    if (typeof s.raw.selfTrade !== "boolean") throw new Error("missing selfTrade fact");
    text(s.miner, "miner");
    text(s.agent, "agent");
    text(s.channelId, "channelId");
    return s;
  });
}

/** Read and validate versioned JSON, including every scored network field. @example parseSnapshot(JSON.parse(json)) */
export function parseSnapshot(value: unknown): Snapshot {
  const o = object(value, "snapshot");
  if (o.schemaVersion !== 1) throw new Error("unsupported snapshot schemaVersion");
  const measuredAt = timestamp(o.measuredAt, "snapshot.measuredAt");
  const c = object(o.collection, "collection");
  const records = list(o.records, "records").map((v): Observation => {
    const r = object(v, "record");
    const kind = text(r.kind, "kind");
    if (!Object.hasOwn(SOURCES, kind)) throw new Error(`unknown surface: ${kind}`);
    if (r.source !== SOURCES[kind as Surface]) throw new Error(`unexpected source for ${kind}`);
    const observed = timestamp(r.measuredAt, "record.measuredAt");
    if (Date.parse(observed) > Date.parse(measuredAt)) throw new Error("record measured after snapshot");
    const record: Observation = {
      kind: kind as Surface,
      source: r.source as string,
      measuredAt: observed,
      raw: object(r.raw, "raw"),
    };
    if (kind === "models") parseModels(record);
    if (kind === "settlements") parseSettlements(record);
    if (kind === "offers") parsePage(record.raw).data.forEach((v) => object(v, "offer"));
    if (kind === "leaderboard")
      list(record.raw.pouiLeaderboard, "pouiLeaderboard").forEach((v) => object(v, "leaderboard row"));
    if (kind === "indexer") {
      const stats = object(record.raw.stats, "indexer.stats");
      nonnegative(stats.latestBlockNumber, "indexer.latestBlockNumber");
      nonnegative(stats.totalAccounts, "indexer.totalAccounts");
    }
    return record;
  });
  if (records.length !== 5 || new Set(records.map((r) => r.kind)).size !== 5)
    throw new Error("snapshot requires each surface exactly once");
  const requests = nonnegative(c.requests, "requests");
  if (!Number.isSafeInteger(requests)) throw new Error("requests must be an integer");
  return {
    schemaVersion: 1,
    measuredAt,
    records,
    collection: {
      requests,
      durationMs: nonnegative(c.durationMs, "durationMs"),
      cacheTtlMs: nonnegative(c.cacheTtlMs, "cacheTtlMs"),
    },
  };
}
