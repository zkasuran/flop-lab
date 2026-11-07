// SPDX-License-Identifier: Apache-2.0
import { McpClient } from "../../../../packages/mcp/src/index";
import { EvidenceFetcher } from "../../../../packages/verifier/src/fetcher";
import { parseEvidence, channelInput } from "./library";
import { publicFetch } from "../../lib/security/transport";

const TTL_MS = 30_000;
type Collector = Pick<EvidenceFetcher, "channel" | "tape" | "stats">;
type Reply = { status: number; body: unknown };

/** One bounded collector per server instance. Example: const read = createEvidenceService(); await read("recent"). */
export function createEvidenceService(
  collector: Collector = new EvidenceFetcher({
    client: new McpClient({ fetch: publicFetch, retries: 0, minIntervalMs: 300, timeoutMs: 5_000 }),
    ttlMs: TTL_MS,
  }),
  now: () => number = Date.now,
) {
  const cache = new Map<string, { at: number; reply: Reply }>();
  let active: { key: string; value: Promise<Reply> } | null = null;
  return async (query: string): Promise<Reply> => {
    let key: string;
    try {
      key = query === "recent" ? query : channelInput(query);
    } catch {
      return { status: 400, body: { error: "Invalid channel ID" } };
    }
    const hit = cache.get(key);
    if (hit && now() - hit.at < TTL_MS) return hit.reply;
    if (active) {
      if (active.key === key) return active.value;
      return { status: 429, body: { error: "Evidence collection is busy. Try again after 30 seconds." } };
    }
    const value = (async (): Promise<Reply> => {
      const before = collector.stats.requests;
      try {
        let body: unknown;
        if (key === "recent") {
          const tape = await collector.tape(6);
          if (tape.errors.length) throw new Error(tape.errors.join("; "));
          body = {
            channelIds: tape.rows.map((row) => channelInput(row.channelId)),
            capturedAt: tape.capturedAt,
            source: tape.source,
            requests: collector.stats.requests - before,
          };
        } else {
          body = {
            bundle: parseEvidence(await collector.channel(key, { maxRows: 100 })),
            requests: collector.stats.requests - before,
          };
        }
        return { status: 200, body };
      } catch {
        return {
          status: 502,
          body: { error: "Public evidence could not be collected. Keep the recorded example or replay a saved file." },
        };
      }
    })();
    active = { key, value };
    try {
      const reply = await value;
      if (cache.size >= 16) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: now(), reply });
      return reply;
    } finally {
      active = null;
    }
  };
}
