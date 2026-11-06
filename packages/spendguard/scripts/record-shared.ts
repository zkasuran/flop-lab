// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { McpClient, listSettlements } from "../../mcp/src/index";

const source = "https://mcp.flop.network/mcp";
const client = new McpClient({ retries: 1, minIntervalMs: 500 });
const result = await listSettlements(client, { limit: 100, offset: 0 });
const recording = {
  source,
  measuredAt: result.measuredAt,
  tool: "flop_list_settlements",
  arguments: { limit: 100, offset: 0 },
  raw: result.raw,
};
if (JSON.stringify(recording).length > 200_000) throw new Error("Recording too large");
await writeFile("fixtures/settlements.json", JSON.stringify(recording, null, 2) + "\n");
console.log(
  JSON.stringify({
    measuredAt: result.measuredAt,
    source,
    rows: result.value.data.length,
    pagination: { total: result.value.total, hasMore: result.value.hasMore },
    requests: client.stats.requests,
  }),
);
const sdkPath = process.argv[2];
if (sdkPath) {
  const sdk = await readFile(sdkPath, "utf8");
  const raw = sdk.match(/\/\*\* R7-P0-08 Calibrated session key limits\. \*\/[\s\S]*?\n};/)?.[0];
  if (!raw || !raw.includes("dailyCap: 50n * 10n ** 18n") || !raw.includes("perTxLimit: 5n * 10n ** 18n"))
    throw new Error("SDK reference changed");
  const caps = {
    source: "https://registry.npmjs.org/@flop-labs/sdk/-/sdk-0.4.0.tgz",
    measuredAt: new Date().toISOString(),
    path: "package/dist/agent-wallet.js",
    symbol: "CALIBRATED_LIMITS",
    status: "SDK reference constants. Not queried runtime limits. Proposed constants excluded.",
    perTxFlop: "5",
    dailyFlop: "50",
    raw,
  };
  await writeFile("fixtures/documented-caps.json", JSON.stringify(caps, null, 2) + "\n");
  console.log(JSON.stringify(caps));
}
