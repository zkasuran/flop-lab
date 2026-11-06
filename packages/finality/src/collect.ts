// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_URL, McpClient, indexerQuery } from "@flop-lab/mcp";
import { analyzeRecording } from "./analysis";
import { QUERY, type Recording } from "./schema";

export const CACHE_TTL_MS = 15_000;
/** One bounded query through the shared MCP client. @example await collect() */
export async function collect(client = new McpClient({ retries: 1, timeoutMs: 8000 })): Promise<Recording> {
  const requests = client.stats.requests;
  const started = Date.now();
  const result = await indexerQuery(client, QUERY);
  const recording: Recording = {
    version: 1,
    source: DEFAULT_URL,
    measuredAt: result.measuredAt,
    query: QUERY,
    raw: result.raw,
    requests: client.stats.requests - requests,
    durationMs: Date.now() - started,
  };
  analyzeRecording(recording);
  return recording;
}

/** Cache success or failure and coalesce callers for one TTL. @example const read = createMonitor(); await read(); */
export function createMonitor(load: () => Promise<Recording> = collect, now = Date.now) {
  let expires = 0;
  let pending: Promise<Recording> | undefined;
  return () => {
    if (!pending || now() >= expires) {
      expires = Infinity;
      pending = load().finally(() => {
        expires = now() + CACHE_TTL_MS;
      });
    }
    return pending;
  };
}
