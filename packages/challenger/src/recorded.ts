// SPDX-License-Identifier: Apache-2.0
// Node-only fixture adapter. Transport parsing stays in the shared MCP client.
import { readFileSync } from "node:fs";
import { DEFAULT_URL, McpClient } from "@flop-lab/mcp";
import { replayFetch } from "@flop-lab/mcp/fixtures";
import { object, text } from "./validation";

interface Recording {
  file: string;
  measuredAt: string;
  request: { method: string; params?: { name: string; arguments: Record<string, unknown> } };
}

/** Replay recorded public responses with their actual capture times. @example const { client, options } = recordedClient() */
export function recordedClient(): {
  client: McpClient;
  options: { now: () => number; source: string; mode: "recorded" };
} {
  const directory = new URL("../fixtures/", import.meta.url);
  const input: unknown = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8"));
  if (!Array.isArray(input)) throw new Error("Invalid recording manifest");
  const entries: Recording[] = input.map((entry: unknown) => {
    const e = object(entry, "recording");
    const request = object(e.request, "request");
    const params = request.params === undefined ? undefined : object(request.params, "params");
    const file = text(e.file, "file");
    if (!/^\d{2}\.sse(?:\.base64)?$/.test(file)) throw new Error("Invalid fixture filename");
    const measuredAt = text(e.measuredAt, "measuredAt");
    if (!Number.isFinite(Date.parse(measuredAt))) throw new Error("Invalid fixture time");
    return {
      file,
      measuredAt,
      request: {
        method: text(request.method, "method"),
        params: params
          ? { name: text(params.name, "name"), arguments: object(params.arguments, "arguments") }
          : undefined,
      },
    };
  });
  const measuredAt = Math.max(...entries.map((e) => Date.parse(e.measuredAt)));
  let clock = measuredAt;
  const client = new McpClient({
    retries: 0,
    minIntervalMs: 0,
    // Replay reads can visit captures out of order. Never sleep on the historical clock.
    sleep: async () => undefined,
    now: () => clock,
    fetch: async (url, init) => {
      const request = object(JSON.parse(String(init?.body)), "request");
      const params = request.params === undefined ? undefined : object(request.params, "params");
      const args = params ? object(params.arguments, "arguments") : {};
      const match = entries.find(
        (e) =>
          e.request.method === request.method &&
          e.request.params?.name === params?.name &&
          Object.keys(e.request.params?.arguments ?? {}).length === Object.keys(args).length &&
          Object.entries(e.request.params?.arguments ?? {}).every(([key, value]) => args[key] === value),
      );
      if (!match) throw new Error("No recorded response for this exact request");
      clock = Date.parse(match.measuredAt);
      const stored = readFileSync(new URL(match.file, directory), "utf8");
      const body = match.file.endsWith(".base64") ? Buffer.from(stored, "base64").toString("utf8") : stored;
      return replayFetch({ [params ? `call-${String(params.name)}` : "tools-list"]: body })(url, init);
    },
  });
  return { client, options: { now: () => measuredAt, source: DEFAULT_URL, mode: "recorded" } };
}
