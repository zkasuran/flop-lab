// SPDX-License-Identifier: Apache-2.0
import { McpClient, DEFAULT_USER_AGENT } from "@flop-lab/mcp";
import { SOURCES, parseSnapshot, object, type Observation, type Snapshot, type Surface } from "./schema";

export interface CollectorOptions {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  cacheTtlMs?: number;
}

/** Cached read-only collector. Calls in flight are shared. @example const snapshot = await new Collector().snapshot(); */
export class Collector {
  readonly stats = { requests: 0, cacheHits: 0 };
  private cached?: Snapshot;
  private pending?: Promise<Snapshot>;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly fetcher: typeof fetch;
  private readonly mcp: McpClient;
  private readonly ttl: number;

  constructor(options: CollectorOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.fetcher = options.fetch ?? fetch;
    this.ttl = options.cacheTtlMs ?? 60_000;
    if (!Number.isFinite(this.ttl) || this.ttl < 0 || this.ttl > 60_000)
      throw new Error("cache TTL must be between 0 and 60000 ms");
    this.mcp = new McpClient({ fetch: this.fetcher, now: this.now, sleep: this.sleep, retries: 2, timeoutMs: 10_000 });
  }

  /** Return a validated snapshot; force bypasses the completed cache. @example await collector.snapshot({ force: true }) */
  async snapshot(options: { force?: boolean } = {}): Promise<Snapshot> {
    if (
      !options.force &&
      this.cached &&
      this.now() - Date.parse(this.cached.measuredAt) >= 0 &&
      this.now() - Date.parse(this.cached.measuredAt) < this.ttl
    ) {
      this.stats.cacheHits++;
      return structuredClone(this.cached);
    }
    this.pending ??= this.collect()
      .then((snapshot) => (this.cached = snapshot))
      .finally(() => {
        this.pending = undefined;
      });
    return structuredClone(await this.pending);
  }

  private async models(): Promise<Observation> {
    for (let attempt = 0; attempt < 3; attempt++) {
      let delay = 400 * 2 ** attempt;
      let retryable = true;
      try {
        this.stats.requests++;
        const response = await this.fetcher(SOURCES.models, {
          headers: { "User-Agent": DEFAULT_USER_AGENT },
          signal: AbortSignal.timeout(10_000),
        });
        retryable = response.status === 429 || response.status >= 500;
        if (!response.ok) {
          const retryAfter = response.headers.get("retry-after");
          if (retryAfter) {
            const seconds = Number(retryAfter);
            const wait = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - this.now();
            if (Number.isFinite(wait)) delay = Math.max(delay, Math.min(30_000, wait));
          }
          throw new Error(`models HTTP ${response.status}`);
        }
        retryable = false;
        return {
          kind: "models",
          source: SOURCES.models,
          measuredAt: new Date(this.now()).toISOString(),
          raw: object(await response.json(), "models"),
        };
      } catch (error) {
        if (!retryable || attempt === 2) throw error;
        await this.sleep(delay);
      }
    }
    throw new Error("models exhausted retries");
  }

  private async collect(): Promise<Snapshot> {
    const started = this.now();
    const count = this.stats.requests;
    const records = [await this.models()];
    const tools: [Surface, string, Record<string, unknown>][] = [
      ["settlements", "flop_list_settlements", { limit: 100, offset: 0 }],
      ["offers", "flop_list_session_offers", { limit: 100, offset: 0 }],
      ["leaderboard", "flop_get_poui_leaderboard", { limit: 100 }],
      ["indexer", "flop_indexer_query", { query: "{ stats { latestBlockNumber totalAccounts } }" }],
    ];
    for (const [kind, tool, args] of tools) {
      const before = this.mcp.stats.requests;
      try {
        const result = await this.mcp.callTool(tool, args);
        records.push({ kind, source: SOURCES[kind], measuredAt: result.measuredAt, raw: object(result.value, tool) });
      } finally {
        this.stats.requests += this.mcp.stats.requests - before;
      }
    }
    return parseSnapshot({
      schemaVersion: 1,
      measuredAt: new Date(this.now()).toISOString(),
      records,
      collection: { requests: this.stats.requests - count, durationMs: this.now() - started, cacheTtlMs: this.ttl },
    });
  }
}
