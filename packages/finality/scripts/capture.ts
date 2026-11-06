// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { McpClient, DEFAULT_URL, indexerQuery, readIndexer } from "@flop-lab/mcp";
import { collect } from "../src/collect";

const directory = new URL("../test/fixtures/", import.meta.url);
await mkdir(directory, { recursive: true });
async function save(name: string, value: unknown) {
  const text = JSON.stringify(value).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`) + "\n";
  if (Buffer.byteLength(text) >= 200_000) throw new Error("Fixture too large");
  await writeFile(new URL(`${name}.json`, directory), text);
}
const client = new McpClient({ retries: 1, timeoutMs: 8000 });
const tools = await client.listTools();
await save("tools", { source: DEFAULT_URL, ...tools });
console.log(tools.value.filter((t) => /block|health|valid|final|param/.test(t.name)));
const query = `{ __schema { queryType { fields { name args { name type { kind name ofType { kind name } } } } } } blockType: __type(name: "Block") { fields { name type { kind name ofType { kind name } } } } statsType: __type(name: "Stats") { fields { name type { kind name ofType { kind name } } } } finalityType: __type(name: "FinalityStatus") { fields { name type { kind name ofType { kind name } } } } }`;
const schema = await indexerQuery(client, query);
await save("schema", { source: DEFAULT_URL, query, ...schema });
const thresholdsSchema = await indexerQuery(
  client,
  `{ __type(name: "FinalityThresholds") { fields { name type { kind name ofType { kind name } } } } }`,
);
await save("threshold-schema", { source: DEFAULT_URL, ...thresholdsSchema });
const observation = await collect(client);
await save("observation", observation);
console.log({ observation: observation.measuredAt, requests: observation.requests });
const blocks = await readIndexer(client, "blocks", { limit: 24 });
await save("blocks", blocks);
console.log({
  measuredAt: blocks.measuredAt,
  blocks: blocks.value.length,
  first: blocks.value[0],
  last: blocks.value.at(-1),
});
const block = await client.callTool("flop_get_block", { number: blocks.value[0]?.number });
await save("block", { source: DEFAULT_URL, ...block });
console.log({ block: block.value, requests: client.stats.requests });
const pin = "2a2cc8218048a2933071bb2f45d75335560e39d8";
const source = `https://raw.githubusercontent.com/flop-labs/yellowpaper/${pin}/yellowpaper.md`;
const response = await fetch(source);
if (!response.ok) throw new Error(`Paper HTTP ${response.status}`);
const raw = await response.text();
const lines = raw.split("\n");
const needles =
  /finality_lag_warn|finality_freeze_threshold|max_finality_stall|^## 2\.|^## 15\.|block_time|rotation|slot_duration/;
const positions = lines.flatMap((line, i) =>
  needles.test(line) || (i >= 311 && i <= 465) || (i >= 2497 && i <= 2670) ? [i] : [],
);
const included = new Set(
  positions.flatMap((i) => Array.from({ length: 7 }, (_, n) => i - 3 + n)).filter((i) => i >= 0 && i < lines.length),
);
const excerpts = [...included].sort((a, b) => a - b).map((i) => ({ line: i + 1, text: lines[i] }));
await save("paper", { source, pin, measuredAt: new Date().toISOString(), excerpts });
console.log({ paper: pin, excerpts: excerpts.length });
