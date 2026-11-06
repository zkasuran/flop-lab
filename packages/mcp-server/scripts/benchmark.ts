// SPDX-License-Identifier: Apache-2.0
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const samples = [];
for (let i = 0; i < 5; i++) {
  const client = new Client({ name: "flop-lab-benchmark", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/cli.js", "--recorded"],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const started = performance.now();
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const readyMs = performance.now() - started;
    const answer = await client.callTool({ name: "lab_verify_tape", arguments: { limit: 1 } });
    const result = answer.structuredContent as Record<string, unknown>;
    samples.push({
      tools: tools.tools.length,
      readyMs: Math.round(readyMs * 100) / 100,
      throughCallMs: Math.round((performance.now() - started) * 100) / 100,
      requests: result.requests,
    });
  } finally {
    await client.close();
  }
}
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      source: "local built stdio server; initialize + tools/list + recorded tape call",
      node: process.version,
      samples,
    },
    null,
    2,
  ),
);
