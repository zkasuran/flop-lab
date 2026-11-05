// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { McpClient } from "@flop-lab/mcp";
import { boundedFetch } from "../lib/devnet";

const destination = new URL("../tests/fixtures/", import.meta.url);
await mkdir(destination, { recursive: true });
async function record(
  name: string,
  url: string,
  response: Response,
  started: number,
  tool: string | null,
  args: object | null,
) {
  const raw = await response.text();
  if (!response.ok || Buffer.byteLength(raw) > 200000)
    throw new Error(`Recording refused: ${name}, HTTP ${response.status}`);
  const record = {
    measuredAt: new Date().toISOString(),
    source: url,
    tool,
    arguments: args,
    status: response.status,
    contentType: response.headers.get("content-type"),
    elapsedMs: Math.round(performance.now() - started),
    raw,
  };
  await writeFile(new URL(`${name}.json`, destination), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`${name}: ${record.measuredAt}, ${record.elapsedMs} ms, ${Buffer.byteLength(raw)} bytes, one request`);
}
for (const [name, tool, args] of [
  ["stats", "flop_get_stats", {}],
  ["settlements", "flop_list_settlements", { limit: 5 }],
] as const) {
  const client = new McpClient({
    retries: 0,
    fetch: async (url, init) => {
      const start = performance.now();
      const response = await boundedFetch(url, init);
      await record(name, String(url), response.clone(), start, tool, args);
      return response;
    },
  });
  await client.callTool(tool, args);
}
const start = performance.now();
const url = "https://api.flop.network/v1/models";
await record("models", url, await boundedFetch(url), start, null, null);
