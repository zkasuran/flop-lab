// SPDX-License-Identifier: Apache-2.0
import { McpClient, McpError, getStats, listSettlements, pickResponse } from "@flop-lab/mcp";
import { unstable_cache } from "next/cache";
import { publicFetch } from "./security/transport";
import stats from "../tests/fixtures/stats.json";
import settlements from "../tests/fixtures/settlements.json";
import models from "../tests/fixtures/models.json";
import {
  MCP_URL,
  MODELS_URL,
  FetchFailure,
  retryDeadline,
  observationCache,
  parseMiners,
  parseSettlements,
  parseStats,
  type Snapshot,
} from "./devnet";

// These are local recorded envelopes, decoded by the shared MCP parser.
function recorded(raw: string): unknown {
  const result = pickResponse(raw, 1).result as { content: { text: string }[] };
  return JSON.parse(result.content[0]?.text ?? "null");
}
let retryAt = 0;
const client = new McpClient({
  retries: 0,
  timeoutMs: 8000,
  fetch: async (url, init) => {
    // Check again when a queued MCP request reaches the transport.
    if (Date.now() < retryAt) throw new FetchFailure("MCP backoff active", retryAt);
    const response = await publicFetch(url, init);
    if (!response.ok) retryAt = Math.max(retryAt, retryDeadline(response.headers));
    return response;
  },
});
async function fromMcp<T>(read: () => Promise<T>): Promise<T> {
  if (Date.now() < retryAt) throw new FetchFailure("MCP backoff active", retryAt);
  try {
    return await read();
  } catch (cause) {
    throw new FetchFailure(
      cause instanceof McpError
        ? `MCP ${cause.kind}${cause.details.status ? ` ${cause.details.status}` : ""}`
        : "MCP unavailable",
      retryAt,
    );
  }
}
const readStats = observationCache(
  () => fromMcp(async () => parseStats({ stats: (await getStats(client)).value })),
  `${MCP_URL} / flop_get_stats`,
  { value: parseStats(recorded(stats.raw)), measuredAt: stats.measuredAt },
);
const readSettlements = observationCache(
  () => fromMcp(async () => parseSettlements({ data: (await listSettlements(client, { limit: 5 })).value.data })),
  `${MCP_URL} / flop_list_settlements?limit=5`,
  { value: parseSettlements(recorded(settlements.raw)), measuredAt: settlements.measuredAt },
);
const readMiners = observationCache(
  async () => {
    const response = await publicFetch(MODELS_URL);
    if (!response.ok) throw new FetchFailure(`HTTP ${response.status}`, retryDeadline(response.headers));
    return parseMiners(await response.json());
  },
  MODELS_URL,
  {
    value: parseMiners(JSON.parse(models.raw)),
    measuredAt: models.measuredAt,
  },
);

/** Read independent dated observations through the shared MCP client. Example: await getSnapshot(). */
export async function getSnapshot(): Promise<Snapshot> {
  const [stats, settlements, miners] = await Promise.all([readStats(), readSettlements(), readMiners()]);
  return { stats, settlements, miners, renderedAt: new Date().toISOString() };
}

/** Share the dated snapshot through Next's data cache. Example: await getCachedSnapshot(). */
export const getCachedSnapshot = unstable_cache(getSnapshot, ["devnet-snapshot-v1"], { revalidate: 30 });
