// SPDX-License-Identifier: Apache-2.0
import { McpClient, McpError, type CallResult } from "./client";

/** Output of `flop_get_stats`. Counts are numbers, `flopLocked` is a raw integer string (18 decimals). */
export interface NetworkStats {
  latestBlockNumber: number;
  totalBlocks: number;
  tps: number;
  activeHTLCs: number;
  totalHTLCs: number;
  proofs24h: number;
  activeOperators: number;
  /** Milliseconds. */
  avgBlockTime: number;
  totalTransactions: number;
  txVolume24h: number;
  totalAccounts: number;
  flopLocked: string;
}

/** One row of `flop_list_settlements`. Amounts are raw integer strings with 18 decimals, kept as strings to stay exact. */
export interface Settlement {
  channelId: string;
  settledBlock: number;
  /** Unix milliseconds. */
  settledAt: number;
  agent: string;
  miner: string;
  escrow: string;
  minerPaid: string;
  burned: string;
  unusedEscrow: string;
  aggregateGn: string;
  /** Decimal string, can carry a fractional part. */
  pricePerGflop: string;
  cooperative: boolean;
  settlementKind: string;
  settlementEvent: string;
  marketKind: string;
  modelHash: string | null;
  assuranceTier: string | null;
  gpuSku: string | null;
  selfTrade: boolean;
  settledBlockHash: string | null;
  extrinsicHash: string | null;
  /** Every field the server sent, untouched, for anything this type does not name. */
  raw: Record<string, unknown>;
}

export interface Page<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SettlementFilter {
  model?: string;
  sku?: string;
  miner?: string;
  agent?: string;
  tier?: string;
  limit?: number;
  offset?: number;
}

function obj(v: unknown, what: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v))
    throw new McpError(`${what} is not an object`, "protocol");
  return v as Record<string, unknown>;
}
function str(o: Record<string, unknown>, k: string, what: string): string {
  const v = o[k];
  if (typeof v !== "string") throw new McpError(`${what}.${k} is not a string`, "protocol");
  return v;
}
function num(o: Record<string, unknown>, k: string, what: string): number {
  const v = o[k];
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new McpError(`${what}.${k} is not a finite number`, "protocol");
  return v;
}
function bool(o: Record<string, unknown>, k: string, what: string): boolean {
  const v = o[k];
  if (typeof v !== "boolean") throw new McpError(`${what}.${k} is not a boolean`, "protocol");
  return v;
}
function intStr(o: Record<string, unknown>, k: string, what: string): string {
  const v = str(o, k, what);
  if (!/^\d+$/.test(v)) throw new McpError(`${what}.${k} is not an integer string: ${v.slice(0, 40)}`, "protocol");
  return v;
}
function optStr(o: Record<string, unknown>, k: string): string | null {
  const v = o[k];
  return typeof v === "string" ? v : null;
}

export function parseStats(v: unknown): NetworkStats {
  const s = obj(obj(v, "stats response").stats, "stats");
  const w = "stats";
  return {
    latestBlockNumber: num(s, "latestBlockNumber", w),
    totalBlocks: num(s, "totalBlocks", w),
    tps: num(s, "tps", w),
    activeHTLCs: num(s, "activeHTLCs", w),
    totalHTLCs: num(s, "totalHTLCs", w),
    proofs24h: num(s, "proofs24h", w),
    activeOperators: num(s, "activeOperators", w),
    avgBlockTime: num(s, "avgBlockTime", w),
    totalTransactions: num(s, "totalTransactions", w),
    txVolume24h: num(s, "txVolume24h", w),
    totalAccounts: num(s, "totalAccounts", w),
    flopLocked: intStr(s, "flopLocked", w),
  };
}

export function parseSettlement(v: unknown): Settlement {
  const o = obj(v, "settlement");
  const w = "settlement";
  return {
    channelId: str(o, "channelId", w),
    settledBlock: num(o, "settledBlock", w),
    settledAt: num(o, "settledAt", w),
    agent: str(o, "agent", w),
    miner: str(o, "miner", w),
    escrow: intStr(o, "escrow", w),
    minerPaid: intStr(o, "minerPaid", w),
    burned: intStr(o, "burned", w),
    unusedEscrow: intStr(o, "unusedEscrow", w),
    aggregateGn: intStr(o, "aggregateGn", w),
    pricePerGflop: str(o, "pricePerGflop", w),
    cooperative: bool(o, "cooperative", w),
    settlementKind: str(o, "settlementKind", w),
    settlementEvent: str(o, "settlementEvent", w),
    marketKind: str(o, "marketKind", w),
    modelHash: optStr(o, "modelHash"),
    assuranceTier: optStr(o, "assuranceTier"),
    gpuSku: optStr(o, "gpuSku"),
    selfTrade: o.selfTrade === true,
    settledBlockHash: optStr(o, "settledBlockHash"),
    extrinsicHash: optStr(o, "extrinsicHash"),
    raw: o,
  };
}

function parsePage<T>(v: unknown, item: (x: unknown) => T, what: string): Page<T> {
  const o = obj(v, what);
  const p = obj(o.pagination, `${what}.pagination`);
  if (!Array.isArray(o.data)) throw new McpError(`${what}.data is not an array`, "protocol");
  return {
    data: o.data.map(item),
    total: num(p, "total", `${what}.pagination`),
    limit: num(p, "limit", `${what}.pagination`),
    offset: num(p, "offset", `${what}.pagination`),
    hasMore: bool(p, "hasMore", `${what}.pagination`),
  };
}

async function mapped<A, B>(p: Promise<CallResult<A>>, f: (a: A) => B): Promise<CallResult<B>> {
  const r = await p;
  return { ...r, value: f(r.value) };
}

export const getStats = (c: McpClient) => mapped(c.callTool("flop_get_stats"), parseStats);

export function listSettlements(c: McpClient, f: SettlementFilter = {}) {
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) if (v !== undefined) args[k] = v;
  return mapped(c.callTool("flop_list_settlements", args), (v) => parsePage(v, parseSettlement, "settlements"));
}

/** Reads settlement pages until `max` rows are collected or the server has no more. */
export async function listAllSettlements(c: McpClient, f: Omit<SettlementFilter, "offset"> = {}, max = 1000) {
  const rows: Settlement[] = [];
  let offset = 0;
  const limit = Math.min(f.limit ?? 100, 100);
  for (;;) {
    const page = (await listSettlements(c, { ...f, limit, offset })).value;
    rows.push(...page.data);
    if (!page.hasMore || rows.length >= max || page.data.length === 0) {
      return { rows: rows.slice(0, max), total: page.total };
    }
    offset += page.data.length;
  }
}

export const listSessionOffers = (
  c: McpClient,
  f: { model?: string; miner?: string; limit?: number; offset?: number } = {},
) => mapped(c.callTool("flop_list_session_offers", f), (v) => parsePage(v, (x) => obj(x, "offer"), "offers"));

export const getComputeChannel = (c: McpClient, channelId: string) =>
  mapped(c.callTool("flop_get_compute_channel", { channel_id: channelId }), (v) => obj(v, "channel"));

export const getTrustRoot = (c: McpClient) => mapped(c.callTool("flop_trust_root"), (v) => obj(v, "trust root"));

export const getPouiLeaderboard = (c: McpClient, limit = 20) =>
  mapped(c.callTool("flop_get_poui_leaderboard", { limit }), (v) => obj(v, "leaderboard"));

/** Runs a read-only GraphQL query against the chain indexer. */
export const indexerQuery = (c: McpClient, query: string, variables?: Record<string, unknown>) =>
  c.callTool("flop_indexer_query", variables ? { query, variables } : { query });

/** Exact check of the documented split: what the miner got, what came back, and what was burned add up to the escrow. */
export function escrowConserved(s: Pick<Settlement, "escrow" | "minerPaid" | "unusedEscrow" | "burned">): boolean {
  return BigInt(s.minerPaid) + BigInt(s.unusedEscrow) + BigInt(s.burned) === BigInt(s.escrow);
}
