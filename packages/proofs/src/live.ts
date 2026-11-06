// SPDX-License-Identifier: Apache-2.0
import { McpClient } from "@flop-lab/mcp";
import {
  count,
  LEADERBOARD_QUERY,
  parseProofs,
  parseSettlements,
  PROOF_QUERY,
  SOURCE,
  type Capture,
  type Recording,
} from "./model";

/** Bounded read-only collector using the shared MCP client's spacing and backoff. Cached observations keep their original times.
 * @example const read = createCollector(); const recording = await read(100);
 */
export function createCollector(
  client = new McpClient({ retries: 1, minIntervalMs: 500, timeoutMs: 15_000 }),
  now = Date.now,
) {
  const cache = new Map<number, { savedAt: number; value: Recording }>();
  return async (limit = 100): Promise<Recording> => {
    count(limit);
    if (limit < 1 || limit > 1000) throw new Error("limit must be between 1 and 1000");
    const cached = cache.get(limit);
    if (cached && now() - cached.savedAt < 60_000) return structuredClone(cached.value);
    const start = now(),
      requests = client.stats.requests,
      captures: Capture[] = [];
    const call = async (tool: string, args: Record<string, unknown>) => {
      let capture: Capture;
      try {
        const r = await client.callTool(tool, args);
        capture = { source: SOURCE, tool, args, measuredAt: r.measuredAt, raw: r.raw, error: null };
      } catch (error) {
        capture = {
          source: SOURCE,
          tool,
          args,
          measuredAt: new Date(now()).toISOString(),
          raw: null,
          error: String(error).slice(0, 4000),
        };
      }
      captures.push(capture);
      return capture;
    };
    await call("flop_get_stats", {});
    await call("flop_get_poui_leaderboard", { limit: 20 });
    await call("flop_indexer_query", { query: LEADERBOARD_QUERY, variables: { limit: 20 } });
    for (let offset = 0; offset < limit;) {
      const size = Math.min(100, limit - offset);
      const r = await call("flop_indexer_query", { query: PROOF_QUERY, variables: { limit: size, offset } });
      if (!r.raw) break;
      try {
        const rows = parseProofs(JSON.parse(r.raw));
        if (rows.length < size) break;
        offset += rows.length;
      } catch {
        break;
      }
    }
    for (let offset = 0; offset < limit;) {
      const size = Math.min(100, limit - offset);
      const r = await call("flop_list_settlements", { limit: size, offset });
      if (!r.raw) break;
      try {
        const page = parseSettlements(JSON.parse(r.raw));
        if (!page.hasMore || !page.rows.length) break;
        offset += page.rows.length;
      } catch {
        break;
      }
    }
    const value: Recording = {
      version: 1,
      startedAt: new Date(start).toISOString(),
      finishedAt: new Date(now()).toISOString(),
      durationMs: now() - start,
      requests: client.stats.requests - requests,
      limit,
      captures,
    };
    cache.set(limit, { savedAt: now(), value: structuredClone(value) });
    return value;
  };
}
