// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { McpClient } from "../../mcp/src/index";

const client = new McpClient({ retries: 1, minIntervalMs: 400 });
const source = "https://mcp.flop.network/mcp";
const tools = await client.listTools();
const names = [
  "flop_trust_root",
  "flop_get_tcb_status",
  "flop_verify_tee_quote",
  "flop_get_inference_receipt",
  "flop_check_htlc",
];
const selected = tools.value.filter((tool) => names.includes(tool.name));
await writeFile(
  new URL("../fixtures/v2-tools.json", import.meta.url),
  JSON.stringify({ source, measuredAt: tools.measuredAt, tools: selected }, null, 2) + "\n",
);
console.log(selected.map((tool) => tool.name));
const query =
  "{ __schema { queryType { fields { name args { name type { kind name ofType { kind name } } } type { kind name ofType { kind name } } } } } }";
const result = await client.callTool("flop_indexer_query", { query });
await writeFile(
  new URL("../fixtures/v2-schema.json", import.meta.url),
  JSON.stringify({ source, ...result }, null, 2) + "\n",
);
console.log("Root schema captured", result.measuredAt);
for (const name of ["ComputeChannel", "SettlementPrice", "Htlc"]) {
  const query = `query { __type(name: "${name}") { fields { name type { kind name ofType { kind name } } } } }`;
  const result = await client.callTool("flop_indexer_query", { query });
  await writeFile(
    new URL(`../fixtures/v2-${name}.json`, import.meta.url),
    JSON.stringify({ source, args: { query }, ...result }, null, 2) + "\n",
  );
  console.log(name, JSON.stringify(result.value));
}
for (const [label, tool, args] of [
  ["trust", "flop_trust_root", {}],
  ["tcb", "flop_get_tcb_status", { platform: "intel-sgx" }],
  ["htlcs", "flop_indexer_query", { query: "{ htlcs(limit: 10) { hashLock status } }" }],
] as const) {
  const result = await client.callTool(tool, args);
  await writeFile(
    new URL(`../fixtures/v2-${label}.json`, import.meta.url),
    JSON.stringify({ source, tool, args, ...result }, null, 2) + "\n",
  );
  console.log(label, result.raw.slice(0, 6000));
}
