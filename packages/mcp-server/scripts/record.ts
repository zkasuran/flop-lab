// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { McpClient } from "@flop-lab/mcp";

const directory = new URL("../fixtures/", import.meta.url);
await mkdir(directory, { recursive: true });
const client = new McpClient({ retries: 0, minIntervalMs: 1000 });
for (const [name, tool, args] of [
  ["pack", "flop_agent_pack_manifest", {}],
  ["skill", "flop_agent_skill_get", { id_or_path: "flop-mcp-tools" }],
  ["layout", "flop_knowledge_get", { id_or_path: "agent-pack" }],
] as const) {
  const measuredAt = new Date().toISOString();
  let raw: string;
  let error = false;
  try {
    raw = (await client.callTool(tool, args)).raw;
  } catch (cause) {
    error = true;
    raw = cause instanceof Error ? cause.message : String(cause);
  }
  await writeFile(
    new URL(`${name}.json`, directory),
    JSON.stringify({ source: "https://mcp.flop.network/mcp", measuredAt, tool, args, error, raw }, null, 2) + "\n",
  );
  console.log(`${name}: ${error ? raw : "recorded"}`);
}
