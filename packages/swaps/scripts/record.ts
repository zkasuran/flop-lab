// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { McpClient, DEFAULT_URL } from "../../mcp/src/index";

const directory = new URL("../fixtures/", import.meta.url);
await mkdir(directory, { recursive: true });
async function save(name: string, value: unknown) {
  const text =
    JSON.stringify(value, null, 2).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`) + "\n";
  if (Buffer.byteLength(text) > 200_000) throw new Error("Fixture exceeds size ceiling");
  await writeFile(new URL(`${name}.json`, directory), text);
}
const client = new McpClient({ retries: 1, timeoutMs: 10_000 });
const tools = await client.listTools();
await save("tools", { source: DEFAULT_URL, ...tools, value: undefined });
const query =
  '{ __type(name: "Query") { fields { name args { name type { kind name ofType { kind name } } } type { kind name ofType { kind name } } } } }';
for (const [name, tool, args] of [
  ["schema", "flop_indexer_query", { query }],
  [
    "htlc-schema",
    "flop_indexer_query",
    { query: '{ __type(name: "Htlc") { fields { name type { kind name ofType { kind name } } } } }' },
  ],
  [
    "htlcs",
    "flop_indexer_query",
    { query: "{ htlcs(limit: 20, offset: 0) { hashLock timeout status amount sender recipient } }" },
  ],
  ["swaps", "flop_list_swaps", { pair: "FLOP_BTC", status: "open", limit: 20 }],
  ["check", "flop_check_htlc", { hash_lock: "00".repeat(32) }],
] as const) {
  const result = await client.callTool(tool, args);
  await save(name, { source: DEFAULT_URL, tool, args, ...result, value: undefined });
  console.log(name, result.measuredAt, `${result.raw.length} characters`);
}
const commit = "2a2cc8218048a2933071bb2f45d75335560e39d8";
const source = `https://raw.githubusercontent.com/flop-labs/yellowpaper/${commit}/yellowpaper.md`;
const response = await fetch(source);
if (!response.ok) throw new Error(`Paper HTTP ${response.status}`);
const paper = await response.text();
const start = paper.indexOf("## 10. HTLC Atomic Swap");
const end = paper.indexOf("\n## 11.", start);
if (start < 0 || end < 0) throw new Error("Section 10 not found");
const names = [
  "htlc_timelock_symmetry_safety_margin_percent",
  "htlc_burn_share_ppt",
  "btc_block_time_flop_blocks",
  "max_finality_stall",
  "finality_freeze_threshold",
];
await save("paper", {
  source,
  commit,
  measuredAt: new Date().toISOString(),
  selection: "Section 10 and named Appendix A rows",
  raw: paper.slice(start, end),
  parameters: paper.split("\n").filter((l) => names.some((n) => l.includes(`<a id="param-${n}">`))),
});
console.log("requests", client.stats.requests);
