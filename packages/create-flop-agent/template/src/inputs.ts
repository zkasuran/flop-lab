// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { McpClient, DEFAULT_URL } from "@flop-lab/mcp";
import { replayFetch } from "@flop-lab/mcp/fixtures";
import { Collector, parseSnapshot } from "@flop-lab/scoreboard";
import { EvidenceFetcher } from "@flop-lab/verifier";
import { object } from "./guards";
import type { Sources } from "./agent";

/** Replay recorded tool text through the shared MCP client. Example: await recordedSources(). */
export async function recordedSources() {
  const root = new URL("../fixtures/", import.meta.url);
  const json = async (name: string): Promise<unknown> =>
    JSON.parse(await readFile(new URL(name, root), "utf8")) as unknown;
  const fixture = object(await json("devnet.json"));
  const snapshot = parseSnapshot({
    ...object(fixture.snapshot),
    records: await Promise.all(
      ["models", "settlements", "offers", "leaderboard", "indexer"].map((name) => json(`${name}.json`)),
    ),
  });
  if (!Array.isArray(fixture.observations)) throw new Error("Missing tool observations");
  const overrides: Record<string, string> = {};
  const dates = new Map<string, string>();
  for (const raw of fixture.observations) {
    const observation = object(raw);
    if (
      observation.source !== DEFAULT_URL ||
      typeof observation.tool !== "string" ||
      typeof observation.raw !== "string" ||
      typeof observation.measuredAt !== "string" ||
      !Number.isFinite(Date.parse(observation.measuredAt))
    )
      throw new Error("Invalid tool observation");
    dates.set(observation.tool, observation.measuredAt);
    overrides[`call-${observation.tool}`] =
      `data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: observation.raw }] } })}\n\n`;
  }
  const now = () => Date.parse(snapshot.measuredAt);
  const client = new McpClient({ fetch: replayFetch(overrides), now, minIntervalMs: 0, retries: 0 });
  const call = async (tool: string) => {
    const measuredAt = dates.get(tool);
    if (!measuredAt) throw new Error(`Missing fixture for ${tool}`);
    return { ...(await client.callTool(tool)), measuredAt };
  };
  const sources: Sources = {
    health: () => call("flop_health"),
    discover: () => call("flop_discover_models"),
    snapshot: async () => snapshot,
    settlement: async () => {
      throw new Error("Fixture replay never executes paid calls");
    },
  };
  return { sources, now, snapshot };
}

/** Live reads only. Collector caches for 60 seconds; MCP backs off on 429 and 5xx. Example: liveSources(). */
export function liveSources() {
  const client = new McpClient({ retries: 1, timeoutMs: 15_000, minIntervalMs: 300 });
  const collector = new Collector({ cacheTtlMs: 60_000 });
  const verifier = new EvidenceFetcher({ client });
  const sources: Sources = {
    health: () => client.callTool("flop_health"),
    discover: () => client.callTool("flop_discover_models"),
    snapshot: () => collector.snapshot(),
    settlement: (id) => verifier.channel(id),
  };
  return { sources, requests: () => client.stats.requests + collector.stats.requests };
}
