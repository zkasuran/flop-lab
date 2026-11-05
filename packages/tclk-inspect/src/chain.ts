// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_URL, McpClient, type CallResult } from "@flop-lab/mcp";
import type { Deal } from "./model";

export const HTLC_QUERY =
  "{ htlcs(limit: 100, offset: 0) { hashLock htlcId status amount sender recipient timeout blockNumber } }";
export interface HtlcRow {
  hashLock: string;
  htlcId: string | null;
  status: string | null;
  amount: string | null;
  sender: string | null;
  recipient: string | null;
  timeout: number | null;
  blockNumber: number | null;
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("expected an HTLC response object");
  return v as Record<string, unknown>;
};
/** Validate the selected indexer fields. Example: parseHtlcs({ htlcs: [] }). */
export function parseHtlcs(value: unknown): HtlcRow[] {
  const rows = object(value).htlcs;
  if (!Array.isArray(rows) || rows.length > 100) throw new Error("expected at most 100 HTLC rows");
  return rows.map((value) => {
    const row = object(value);
    if (typeof row.hashLock !== "string" || !/^0x[0-9a-f]{64}$/.test(row.hashLock))
      throw new Error("invalid HTLC hashLock");
    for (const key of ["htlcId", "status", "amount", "sender", "recipient"])
      if (row[key] !== null && typeof row[key] !== "string") throw new Error(`invalid HTLC ${key}`);
    if (typeof row.amount === "string" && !/^\d+$/.test(row.amount)) throw new Error("invalid HTLC amount");
    for (const key of ["timeout", "blockNumber"])
      if (row[key] !== null && (!Number.isSafeInteger(row[key]) || (row[key] as number) < 0))
        throw new Error(`invalid HTLC ${key}`);
    return row as unknown as HtlcRow;
  });
}
/** Interpret only the recorded check response. Example: parseHtlcCheck("HTLC not found or RPC unavailable."). */
export function parseHtlcCheck(value: unknown): string {
  if (value === "HTLC not found or RPC unavailable.")
    return "Not found or RPC unavailable. The service does not distinguish these cases.";
  // No successful checker shape was observed. Do not invent one or coerce it into proof.
  throw new Error("unrecognized flop_check_htlc response; raw evidence retained");
}
export interface ChainEvidence {
  source: string;
  measuredAt: string;
  raw?: string;
  query?: string;
  error?: string;
}
export interface ChainLink {
  status: "observed" | "no-match-in-page" | "unavailable" | "not-applicable";
  hashLock?: string;
  rows: HtlcRow[];
  sampledRows: number;
  check: string;
  evidence: ChainEvidence[];
  requests: number;
  cacheTtlMs: number;
  cached: boolean;
  limit: string;
}
/** Create a read-only reader with a 60 second cache. Example: await createChainReader()(report.state). */
export function createChainReader(client = new McpClient({ retries: 1 }), now: () => number = Date.now) {
  const cache = new Map<string, { until: number; value: Promise<ChainLink> }>();
  return async (deal: Deal | null): Promise<ChainLink> => {
    const base: ChainLink = {
      status: "not-applicable",
      rows: [],
      sampledRows: 0,
      check: "No accepted hash statement to query.",
      evidence: [],
      requests: 0,
      cacheTtlMs: 60_000,
      cached: false,
      limit:
        "Only the first 100 indexer rows are sampled. A hash match does not bind amount, parties, deadline or rail reference and is not a payment proof.",
    };
    if (deal?.offer.lock !== "hash" || !deal.statement) return base;
    if (!/^0x[0-9a-f]{64}$/.test(deal.statement)) throw new Error("invalid hash statement");
    const hash = deal.statement;
    const found = cache.get(hash);
    if (found && found.until > now()) return { ...(await found.value), requests: 0, cached: true };
    const run = async (): Promise<ChainLink> => {
      const report = { ...base, hashLock: hash, status: "unavailable" as ChainLink["status"] };
      const before = client.stats.requests;
      const call = async (tool: string, args: Record<string, unknown>, use: (value: unknown) => void) => {
        let result: CallResult<unknown> | undefined;
        try {
          result = await client.callTool(tool, args);
          use(result.value);
          report.evidence.push({
            source: `${DEFAULT_URL}#${tool}`,
            measuredAt: result.measuredAt,
            raw: result.raw,
            query: JSON.stringify(args),
          });
        } catch (e) {
          report.evidence.push({
            source: `${DEFAULT_URL}#${tool}`,
            measuredAt: result?.measuredAt ?? new Date(now()).toISOString(),
            ...(result ? { raw: result.raw } : {}),
            query: JSON.stringify(args),
            error: e instanceof Error ? e.message : "request failed",
          });
        }
      };
      report.check = "Checker unavailable. See dated evidence.";
      await call("flop_check_htlc", { hash_lock: hash }, (v) => {
        report.check = parseHtlcCheck(v);
      });
      await call("flop_indexer_query", { query: HTLC_QUERY }, (v) => {
        const rows = parseHtlcs(v);
        report.sampledRows = rows.length;
        report.rows = rows.filter((r) => r.hashLock === hash);
        report.status = report.rows.length ? "observed" : "no-match-in-page";
      });
      report.requests = client.stats.requests - before;
      return report;
    };
    if (cache.size >= 100) cache.clear();
    const value = run();
    cache.set(hash, { until: now() + 60_000, value });
    return value;
  };
}
