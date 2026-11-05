// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_URL, McpClient, getStats, listSettlements } from "@flop-lab/mcp";
import { block, integer, settlement } from "./validation";
import type { Tape } from "./types";

export const CACHE_TTL_MS = 60_000;

/** Fetch a bounded tape plus block-cadence observations. @example await collectTape(new McpClient()) */
export async function collectTape(
  client: McpClient,
  options: { now?: () => number; maxRows?: number; source?: string; mode?: "live" | "recorded" } = {},
): Promise<Tape> {
  const now = options.now ?? Date.now;
  const maxRows = integer(options.maxRows ?? 1000, "maxRows", 1);
  if (maxRows > 10_000) throw new Error("maxRows must be <= 10000");
  const source = options.source ?? DEFAULT_URL;
  const startRequests = client.stats.requests;
  const tape: Tape = {
    settlements: [],
    source,
    startedAt: new Date(now()).toISOString(),
    measuredAt: "",
    mode: options.mode ?? "live",
    pages: [],
    rowMeasuredAt: {},
    coverage: { complete: false, reportedTotal: 0, notes: [] },
    blocks: [],
    warnings: [],
    requests: 0,
  };
  const seen = new Set<string>();
  let offset = 0;
  let previousTotal: number | undefined;
  while (offset < maxRows) {
    const limit = Math.min(100, maxRows - offset);
    const result = await listSettlements(client, { limit, offset });
    const p = result.value;
    integer(p.total, "pagination.total");
    if (p.offset !== offset || p.data.length > limit) throw new Error("Settlement pagination does not match request");
    if (previousTotal !== undefined && p.total !== previousTotal)
      tape.coverage.notes.push("Reported total changed during pagination.");
    previousTotal = p.total;
    tape.coverage.reportedTotal = p.total;
    tape.pages.push({ measuredAt: result.measuredAt, offset, count: p.data.length, total: p.total });
    for (const raw of p.data) {
      const row = settlement(raw.raw);
      if (seen.has(row.channelId)) {
        tape.coverage.notes.push("Duplicate channel encountered during pagination. First observation kept.");
      } else {
        seen.add(row.channelId);
        tape.settlements.push(row);
        Object.defineProperty(tape.rowMeasuredAt, row.channelId, {
          value: result.measuredAt,
          enumerable: true,
          configurable: true,
        });
      }
    }
    offset += p.data.length;
    if (!p.hasMore) {
      tape.coverage.complete = tape.coverage.notes.length === 0 && tape.settlements.length === p.total;
      break;
    }
    if (p.data.length === 0) {
      tape.coverage.notes.push("Empty page claimed more rows. Pagination stopped.");
      break;
    }
  }
  if (!tape.coverage.complete)
    tape.coverage.notes.push("Partial or unstable tape. Rankings describe only retrieved rows.");
  // Cadence failure must not discard a usable settlement tape.
  try {
    const stats = await getStats(client);
    const latest = integer(stats.value.latestBlockNumber, "latestBlockNumber");
    for (const number of [...new Set([Math.max(0, latest - 100), latest])]) {
      const result = await client.callTool("flop_get_block", { number });
      const value = block(result.value);
      if (value.number !== number) throw new Error("Block response does not match requested height");
      tape.blocks.push({ value, measuredAt: result.measuredAt, source: `${source}#flop_get_block` });
    }
  } catch (error) {
    tape.warnings.push(`Block cadence unavailable: ${error instanceof Error ? error.message : "request failed"}`);
  }
  tape.measuredAt = new Date(now()).toISOString();
  if (tape.mode === "recorded") {
    const observations = [...tape.pages, ...tape.blocks].map((entry) => Date.parse(entry.measuredAt));
    if (observations.length) tape.startedAt = new Date(Math.min(...observations)).toISOString();
  }
  tape.requests = client.stats.requests - startRequests;
  return tape;
}

/** Cache successful snapshots and failures for an explicit TTL. Concurrent reads share one collection. @example const watcher = new Watcher(); await watcher.read(); */
export class Watcher {
  private cached: Promise<Tape> | undefined;
  private expires = 0;

  constructor(
    private readonly client = new McpClient({ retries: 1 }),
    private readonly options: NonNullable<Parameters<typeof collectTape>[1]> = {},
  ) {}

  /** Return a snapshot without hiding its original observation time. @example await watcher.read() */
  read(): Promise<Tape> {
    const now = this.options.now ?? Date.now;
    if (!this.cached || now() >= this.expires) {
      this.expires = Infinity;
      this.cached = collectTape(this.client, this.options).finally(() => {
        this.expires = now() + CACHE_TTL_MS;
      });
    }
    return this.cached.then((tape) => structuredClone(tape));
  }
}
