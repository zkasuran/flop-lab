// SPDX-License-Identifier: Apache-2.0
import { McpClient, readIndexer, listSettlements, listSessionOffers } from "@flop-lab/mcp";
import { parsePage, source, type Capture, type Kind, type Observation } from "./schema";
/** Read bounded pages with the shared spaced/retrying transport. No automatic polling.
 * @example await collectSessions({ maxPages: 20 })
 */
export async function collectSessions(options: { client?: McpClient; maxPages?: number } = {}): Promise<Capture> {
  const maxPages = options.maxPages ?? 20;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new Error("maxPages must be 1 to 20");
  const client = options.client ?? new McpClient({ retries: 1, timeoutMs: 10_000, minIntervalMs: 300 });
  const start = Date.now(),
    before = client.stats.requests;
  const observations: Observation[] = [];
  for (const kind of ["channels", "settlements", "offers"] as Kind[]) {
    let offset = 0;
    for (let page = 0; page < (kind === "offers" ? 1 : maxPages); page++) {
      try {
        const r =
          kind === "channels"
            ? await readIndexer(client, "computeChannels", { limit: 50, offset })
            : kind === "settlements"
              ? await listSettlements(client, { limit: 50, offset })
              : await listSessionOffers(client, { limit: 50, offset });
        const o: Observation = { kind, source, measuredAt: r.measuredAt, offset, raw: r.raw, error: null };
        if (new TextEncoder().encode(r.raw).length > 190_000) throw new Error("Response exceeds recording limit");
        const p = parsePage(o);
        observations.push(o);
        if (!p.pagination.hasMore || p.data.length === 0) break;
        offset += p.data.length;
      } catch (error) {
        observations.push({
          kind,
          source,
          measuredAt: new Date().toISOString(),
          offset,
          raw: null,
          error: error instanceof Error ? error.message : "Read failed",
        });
        break;
      }
    }
  }
  return {
    version: 1,
    startedAt: new Date(start).toISOString(),
    finishedAt: new Date().toISOString(),
    requests: client.stats.requests - before,
    durationMs: Date.now() - start,
    observations,
  };
}
/** A per-process TTL cache coalesces concurrent readers. Rejected reads are evicted.
 * @example const read = cachedCollector(() => collectSessions(), 60_000)
 */
export function cachedCollector(load: () => Promise<Capture>, ttlMs = 60_000, now = Date.now) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 0) throw new Error("Invalid cache TTL");
  let cached: Promise<Capture> | null = null,
    expires = 0;
  return () => {
    if (!cached || now() >= expires) {
      expires = Infinity;
      cached = load()
        .then((value) => {
          expires = now() + ttlMs;
          return value;
        })
        .catch((error) => {
          cached = null;
          throw error;
        });
    }
    return cached;
  };
}
