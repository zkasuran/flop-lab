// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { McpClient } from "@flop-lab/mcp";
import { SwapReader } from "../src/observed";

const start = performance.now();
const command = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "--help"], {
  encoding: "utf8",
});
if (command.status !== 0) throw new Error(command.stderr);
const coldStartMs = performance.now() - start;
const client = new McpClient({ retries: 1, timeoutMs: 8000 });
const reader = new SwapReader(client);
const first = performance.now();
const observation = await reader.observe();
const liveDurationMs = performance.now() - first;
const requests = client.stats.requests;
await reader.observe();
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      host: "local build host",
      node: process.version,
      command: "node packages/swaps/dist/cli.js --help",
      coldStartMs,
      liveDurationMs,
      requests,
      repeatRequests: client.stats.requests - requests,
      observation,
    },
    null,
    2,
  ),
);
