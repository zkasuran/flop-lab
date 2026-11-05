// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { McpClient } from "@flop-lab/mcp";

const sha = "2a2cc8218048a2933071bb2f45d75335560e39d8";
const dir = new URL("../fixtures/", import.meta.url);
await mkdir(dir, { recursive: true });
async function save(name: string, data: unknown) {
  const text = JSON.stringify(data).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  if (Buffer.byteLength(text) > 200_000) throw new Error(`${name} exceeds fixture size limit`);
  await writeFile(new URL(name, dir), text + "\n");
}
const source = `https://raw.githubusercontent.com/flop-labs/yellowpaper/${sha}/yellowpaper.md`;
if (!process.argv.includes("--runtime")) {
  const response = await fetch(source, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`yellowpaper HTTP ${response.status}`);
  const raw = await response.text();
  const measuredAt = new Date().toISOString();
  const lines = raw.split("\n");
  for (let start = 0; start < lines.length; start += 750) {
    await save(`paper-${start / 750}.json`, {
      sha,
      source,
      measuredAt,
      startLine: start + 1,
      raw: lines.slice(start, start + 750).join("\n"),
    });
  }
  console.log(JSON.stringify({ sha, bytes: Buffer.byteLength(raw), lines: lines.length, measuredAt }));
  console.log(
    lines
      .flatMap((line, i) => (/^#{1,3} .*([Aa]ppendix|[Vv]ector)/.test(line) ? [`${i + 1}: ${line}`] : []))
      .join("\n"),
  );
  for (const path of ["evidence/money-path-v1.json", "evidence/wire-format-v1.json"]) {
    const url = `https://raw.githubusercontent.com/flop-labs/yellowpaper/${sha}/${path}`;
    const result = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!result.ok) throw new Error(`${path}: HTTP ${result.status}`);
    await save(path.split("/")[1]!, {
      sha,
      source: url,
      measuredAt: new Date().toISOString(),
      raw: await result.text(),
    });
  }
}
const client = new McpClient({ retries: 1, minIntervalMs: 500 });
const tools = await client.listTools();
await save("tools.json", { source: "https://mcp.flop.network/mcp", ...tools, value: undefined });
console.log(`tools: ${tools.value.length}`);
for (const [name, tool, args] of [
  ["knowledge", "flop_knowledge_get", { id_or_path: "protocol-params" }],
  ["related", "flop_knowledge_search", { query: "protocol parameters", limit: 8 }],
  ["stats", "flop_get_stats", {}],
  [
    "transaction-schema",
    "flop_indexer_query",
    { query: '{ __type(name: "Transaction") { name fields { name type { kind name ofType { kind name } } } } }' },
  ],
  [
    "transactions",
    "flop_indexer_query",
    { query: "{ transactions(limit: 100, offset: 0) { hash blockNumber section method args success timestamp } }" },
  ],
] as const) {
  try {
    const result = await client.callTool(tool, args);
    await save(`${name}.json`, { source: "https://mcp.flop.network/mcp", tool, args, ...result, value: undefined });
    console.log(`${name}: ${Buffer.byteLength(result.raw)} bytes at ${result.measuredAt}`);
    if (name === "transactions") {
      const data = result.value as { transactions?: { hash?: string }[] };
      const hash = data.transactions?.[0]?.hash;
      if (typeof hash === "string") {
        const query =
          "query($hash: String!) { transaction(hash: $hash) { hash blockNumber section method args success timestamp } }";
        const detailArgs = { query, variables: { hash } };
        const detail = await client.callTool("flop_indexer_query", detailArgs);
        await save("transaction.json", {
          source: "https://mcp.flop.network/mcp",
          tool: "flop_indexer_query",
          args: detailArgs,
          ...detail,
          value: undefined,
        });
      }
    }
  } catch (error) {
    console.log(`${name}: ${String(error)}`);
  }
}
console.log(client.stats);
