// SPDX-License-Identifier: Apache-2.0
import { McpClient, McpError } from "../../mcp/src/index";
import { canonical, sealEvidence, sealObservation } from "./bundle";
import { checkArithmetic, resultCode } from "./checks/index";
import { array, boolean, hash, height, object } from "./schema";
import type { Check, Evidence, Observation } from "./types";

const SOURCE = "https://mcp.flop.network/mcp";
const TX_QUERY =
  "query($hash: String!) { transaction(hash: $hash) { hash blockHash blockNumber indexInBlock section method args success timestamp } }";
const CHANNEL_QUERY =
  "query($id: String!) { computeChannel(channelId: $id) { channelId finalRoot challengeEnd verifierRef } }";

export interface TapeReport {
  capturedAt: string;
  source: string;
  requestedLimit: number;
  rows: { channelId: string; checks: Check[] }[];
  observations: Observation[];
  complete: boolean;
  errors: string[];
  exitCode: 0 | 1 | 3;
}

/** Bounded read-only evidence collection with a per-instance cache.
 * @example const fetcher = new EvidenceFetcher(); const bundle = await fetcher.channel(channelId);
 */
export class EvidenceFetcher {
  private readonly client: McpClient;
  private readonly cache = new Map<string, { at: number; value: Promise<Observation> }>();
  private readonly now: () => number;
  readonly ttlMs: number;

  constructor(options: { client?: McpClient; ttlMs?: number; now?: () => number } = {}) {
    this.client = options.client ?? new McpClient({ retries: 2, minIntervalMs: 300, timeoutMs: 15_000 });
    this.ttlMs = options.ttlMs ?? 30_000;
    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs < 0) throw new Error("ttlMs must be a nonnegative integer");
    this.now = options.now ?? Date.now;
  }

  /** Actual HTTP attempts and retries from the shared client. Example: fetcher.stats.requests. */
  get stats() {
    return { ...this.client.stats };
  }

  private async observe(id: string, tool: string, args: Record<string, unknown> = {}): Promise<Observation> {
    const key = canonical({ id, tool, args });
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < this.ttlMs) return structuredClone(await cached.value);
    if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value!);
    const value = (async () => {
      const started = this.now();
      try {
        const result = await this.client.callTool(tool, args);
        return await sealObservation({
          id,
          source: SOURCE,
          tool,
          args,
          measuredAt: result.measuredAt,
          durationMs: result.durationMs,
          attempts: result.attempts,
          raw: result.raw,
          error: null,
        });
      } catch (error) {
        return await sealObservation({
          id,
          source: SOURCE,
          tool,
          args,
          measuredAt: new Date(this.now()).toISOString(),
          durationMs: this.now() - started,
          attempts: error instanceof McpError ? (error.details.attempts ?? 1) : 1,
          raw: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    this.cache.set(key, { at: this.now(), value });
    return structuredClone(await value);
  }

  private data(obs: Observation): Record<string, unknown> {
    if (obs.raw === null) throw new Error(obs.error ?? "No answer");
    return object(JSON.parse(obs.raw) as unknown, obs.id);
  }

  private async pages(limit: number, filter: Record<string, unknown> = {}, stopId?: string) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new Error("limit must be an integer from 1 to 1000");
    const observations: Observation[] = [];
    const rows: Record<string, unknown>[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();
    let complete = false;
    while (rows.length < limit) {
      const offset = rows.length;
      const obs = await this.observe(`settlements:${offset}`, "flop_list_settlements", {
        ...filter,
        limit: Math.min(25, limit - offset),
        offset,
      });
      observations.push(obs);
      try {
        const page = this.data(obs);
        const pagination = object(page.pagination, "pagination");
        const more = boolean(pagination.hasMore, "hasMore");
        height(pagination.total, "pagination.total");
        if (height(pagination.offset, "pagination.offset") !== offset) throw new Error("Unexpected page offset");
        const requested = Number(obs.args.limit);
        if (height(pagination.limit, "pagination.limit") !== requested) throw new Error("Unexpected page limit");
        const data = array(page.data, "settlements.data").map((r) => object(r, "settlement"));
        if (data.length > requested) throw new Error("Server exceeded the requested page limit");
        for (const row of data) {
          const id = hash(row.channelId, "channelId");
          if (seen.has(id)) throw new Error("Duplicate channel across pages; the tape changed during capture");
          seen.add(id);
          rows.push(row);
        }
        if (!more) {
          complete = true;
          break;
        }
        if (stopId && data.some((row) => row.channelId === stopId)) break;
        if (data.length === 0) throw new Error("Empty page claims more rows");
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        break;
      }
    }
    return { observations, rows, errors, complete };
  }

  /** Collect a channel and its matching settlement pages. Bounded to 400 rows by default.
   * @example await fetcher.channel("0x...", {maxRows: 100});
   */
  async channel(channelId: string, options: { maxRows?: number } = {}): Promise<Evidence> {
    const id = hash(channelId, "channelId");
    const observations: Observation[] = [];
    const channel = await this.observe("channel", "flop_get_compute_channel", { channel_id: id });
    observations.push(channel);
    let c: Record<string, unknown> = {};
    try {
      c = this.data(channel);
    } catch {
      /* Keep the exact failed observation for offline checks. */
    }
    const page = await this.pages(options.maxRows ?? 400, typeof c.agent === "string" ? { agent: c.agent } : {}, id);
    observations.push(...page.observations);
    const rows = page.rows.filter((r) => r.channelId === id);
    if (rows[0]) {
      const row = rows[0];
      if (typeof row.settledBlock === "number" && Number.isSafeInteger(row.settledBlock) && row.settledBlock >= 0)
        observations.push(await this.observe("block", "flop_get_block", { number: row.settledBlock }));
      if (typeof row.extrinsicHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(row.extrinsicHash))
        observations.push(
          await this.observe("transaction", "flop_indexer_query", {
            query: TX_QUERY,
            variables: { hash: row.extrinsicHash },
          }),
        );
    }
    observations.push(
      await this.observe("channel-index", "flop_indexer_query", { query: CHANNEL_QUERY, variables: { id } }),
    );
    observations.push(await this.observe("models", "flop_discover_models", { max_results: 1000 }));
    observations.push(await this.observe("trust-root", "flop_trust_root"));
    observations.push(await this.observe("head", "flop_get_stats"));
    const receiptLink = c.hashLock ?? c.hash_lock ?? rows[0]?.hashLock ?? rows[0]?.hash_lock;
    if (typeof receiptLink === "string" && /^0x[0-9a-fA-F]{64}$/.test(receiptLink))
      observations.push(await this.observe("receipt", "flop_get_inference_receipt", { hash_lock: receiptLink }));
    return sealEvidence({
      version: 1,
      network: "flop-devnet",
      channelId: id,
      capturedAt: new Date(this.now()).toISOString(),
      observations,
    });
  }

  /** Audit the latest bounded tape using exact arithmetic. Empty or partial failures are explicit.
   * @example const report = await fetcher.tape(25);
   */
  async tape(limit = 20): Promise<TapeReport> {
    const page = await this.pages(limit);
    const rows = page.rows.map((row) => ({ channelId: String(row.channelId), checks: checkArithmetic(row) }));
    const checks = rows.flatMap((r) => r.checks);
    if (page.errors.length || rows.length === 0)
      checks.push({
        id: "tape-availability",
        claim: "Tape data is available",
        status: "UNVERIFIABLE",
        detail: page.errors.join("; ") || "No settlements",
        inputs: {},
        evidence: [],
      });
    return {
      capturedAt: new Date(this.now()).toISOString(),
      source: SOURCE,
      requestedLimit: limit,
      rows,
      observations: page.observations,
      complete: page.complete,
      errors: page.errors,
      exitCode: resultCode(checks),
    };
  }
}
