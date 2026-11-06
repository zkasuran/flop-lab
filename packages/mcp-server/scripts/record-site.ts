// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const directory = new URL("../../../apps/web/app/mcp/", import.meta.url);
const client = new Client({ name: "flop-lab-site-recorder", version: "1" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "--recorded"],
  stderr: "pipe",
});
try {
  await client.connect(transport);
  const list = await client.listTools();
  const measuredAt = new Date().toISOString();
  await writeFile(
    new URL("tool-list.json", directory),
    JSON.stringify({ source: "local built flop-lab MCP server: tools/list", measuredAt, ...list }) + "\n",
  );
  const args = { mode: "recorded", limit: 1 };
  const answer = await client.callTool({ name: "lab_verify_tape", arguments: args });
  if (answer.isError) throw new Error("Recorded example failed");
  await writeFile(
    new URL("example.json", directory),
    JSON.stringify(
      {
        source: "local built flop-lab MCP server: tools/call",
        measuredAt,
        request: { name: "lab_verify_tape", arguments: args },
        result: answer.structuredContent,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ measuredAt, tools: list.tools.length }));
} finally {
  await client.close();
}
