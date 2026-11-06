// SPDX-License-Identifier: Apache-2.0
import { McpClient, DEFAULT_URL } from "@flop-lab/mcp";
import { integer } from "./model";

export const QUERY = `{
  stats { latestBlockNumber totalBlocks }
  networkValue { contributors effectiveCoalitions concentration models effectiveAgents }
  termCurve(days: 1) { methodologyVersion asOfDay days blocksPerDay transactionAnchored
    history { day tenorDays medianPricePerGn tradeCount publishable }
  }
  settlementPrices(limit: 20, offset: 0) {
    data { channelId settledBlock settledBlockHash escrow minerPaid burned unusedEscrow cooperative settlementKind settlementEvent marketKind }
    pagination { total limit offset hasMore }
  }
}`;
export type Settlement = {
  channelId: string;
  settledBlock: number;
  settledBlockHash: string | null;
  escrow: string;
  minerPaid: string;
  burned: string;
  unusedEscrow: string;
  cooperative: boolean | null;
  settlementKind: string;
  settlementEvent: string;
  marketKind: string;
};
export type Observation = {
  source: string;
  measuredAt: string;
  query: string;
  raw: string;
  data: {
    stats: { latestBlockNumber: number | null; totalBlocks: number | null } | null;
    networkValue: {
      contributors: number;
      effectiveCoalitions: number;
      concentration: number;
      models: number;
      effectiveAgents: number;
    } | null;
    termCurve: {
      methodologyVersion: string;
      asOfDay: string;
      days: number;
      blocksPerDay: number;
      transactionAnchored: boolean;
      history: {
        day: string;
        tenorDays: number;
        medianPricePerGn: string | null;
        tradeCount: number;
        publishable: boolean;
      }[];
    } | null;
    settlements: Settlement[] | null;
    pagination: { total: number; limit: number; offset: number; hasMore: boolean } | null;
  };
};
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected object");
  return v as Record<string, unknown>;
}
function text(v: unknown): string {
  if (typeof v !== "string" || v.length > 4096) throw new Error("Expected bounded string");
  return v;
}
function count(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new Error("Expected nonnegative safe integer");
  return v;
}
function finite(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error("Expected nonnegative finite number");
  return v;
}
function bool(v: unknown): boolean {
  if (typeof v !== "boolean") throw new Error("Expected boolean");
  return v;
}
function amount(v: unknown): string {
  const s = text(v);
  integer(s);
  return s;
}
function nullable<T>(v: unknown, parse: (v: unknown) => T): T | null {
  return v === null ? null : parse(v);
}
function array<T>(v: unknown, max: number, parse: (v: unknown) => T): T[] {
  if (!Array.isArray(v) || v.length > max) throw new Error("Expected bounded array");
  return v.map(parse);
}

/** Validate every selected field and preserve the raw tool text. @example parseObservation(savedJson) */
export function parseObservation(input: unknown): Observation {
  const envelope = object(input);
  const source = text(envelope.source);
  if (source !== DEFAULT_URL) throw new Error("Unexpected observation source");
  const measuredAt = text(envelope.measuredAt);
  if (!/^\d{4}-\d\d-\d\dT/.test(measuredAt) || !Number.isFinite(Date.parse(measuredAt)))
    throw new Error("Invalid observation time");
  const query = text(envelope.query);
  if (query !== QUERY) throw new Error("Unexpected observation query");
  if (typeof envelope.raw !== "string" || envelope.raw.length > 190_000) throw new Error("Invalid raw response");
  const raw = envelope.raw;
  const d = object(JSON.parse(raw));
  if (d.errors !== undefined) throw new Error("Indexer returned GraphQL errors");
  const stats = nullable(d.stats, (v) => {
    const o = object(v);
    return { latestBlockNumber: nullable(o.latestBlockNumber, count), totalBlocks: nullable(o.totalBlocks, count) };
  });
  const networkValue = nullable(d.networkValue, (v) => {
    const o = object(v);
    return {
      contributors: count(o.contributors),
      models: count(o.models),
      effectiveCoalitions: finite(o.effectiveCoalitions),
      concentration: finite(o.concentration),
      effectiveAgents: finite(o.effectiveAgents),
    };
  });
  const termCurve = nullable(d.termCurve, (v) => {
    const o = object(v);
    return {
      methodologyVersion: text(o.methodologyVersion),
      asOfDay: text(o.asOfDay),
      days: count(o.days),
      blocksPerDay: count(o.blocksPerDay),
      transactionAnchored: bool(o.transactionAnchored),
      history: array(o.history, 200, (value) => {
        const p = object(value);
        const price = nullable(p.medianPricePerGn, text);
        if (price !== null && !/^\d+(\.\d+)?$/.test(price)) throw new Error("Invalid term price");
        return {
          day: text(p.day),
          tenorDays: count(p.tenorDays),
          medianPricePerGn: price,
          tradeCount: count(p.tradeCount),
          publishable: bool(p.publishable),
        };
      }),
    };
  });
  const connection = nullable(d.settlementPrices, (v) => {
    const o = object(v),
      p = object(o.pagination);
    const data = array(o.data, 20, (value) => {
      const r = object(value);
      return {
        channelId: text(r.channelId),
        settledBlock: count(r.settledBlock),
        settledBlockHash: nullable(r.settledBlockHash, text),
        escrow: amount(r.escrow),
        minerPaid: amount(r.minerPaid),
        burned: amount(r.burned),
        unusedEscrow: amount(r.unusedEscrow),
        cooperative: nullable(r.cooperative, bool),
        settlementKind: text(r.settlementKind),
        settlementEvent: text(r.settlementEvent),
        marketKind: text(r.marketKind),
      };
    });
    const pagination = {
      total: count(p.total),
      limit: count(p.limit),
      offset: count(p.offset),
      hasMore: bool(p.hasMore),
    };
    if (
      pagination.limit !== 20 ||
      pagination.offset !== 0 ||
      pagination.total < data.length ||
      pagination.hasMore !== pagination.total > data.length
    )
      throw new Error("Inconsistent pagination");
    if (new Set(data.map((r) => r.channelId)).size !== data.length) throw new Error("Duplicate settlement");
    return { data, pagination };
  });
  return {
    source,
    measuredAt,
    query,
    raw,
    data: {
      stats,
      networkValue,
      termCurve,
      settlements: connection?.data ?? null,
      pagination: connection?.pagination ?? null,
    },
  };
}

/** Shared-client collector with a 30 second per-instance TTL. Failures are not cached. @example await new EconomicsCollector().collect() */
export class EconomicsCollector {
  private cached?: { at: number; value: Observation };
  constructor(
    private readonly client = new McpClient({ retries: 1 }),
    private readonly now = Date.now,
  ) {}
  async collect(): Promise<Observation> {
    if (this.cached && this.now() - this.cached.at < 30_000) return this.cached.value;
    const r = await this.client.callTool("flop_indexer_query", { query: QUERY });
    const value = parseObservation({ source: DEFAULT_URL, measuredAt: r.measuredAt, query: QUERY, raw: r.raw });
    this.cached = { at: this.now(), value };
    return value;
  }
}
