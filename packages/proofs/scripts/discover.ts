// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { McpClient } from "../../mcp/src/index";

const dir = new URL("../fixtures/", import.meta.url);
await mkdir(dir, { recursive: true });
async function save(name: string, data: unknown) {
  const raw = JSON.stringify(data).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  if (Buffer.byteLength(raw) > 200_000) throw new Error("Fixture exceeds byte ceiling");
  await writeFile(new URL(`${name}.json`, dir), raw + "\n");
}
const sha = "2a2cc8218048a2933071bb2f45d75335560e39d8";
const source = `https://raw.githubusercontent.com/flop-labs/yellowpaper/${sha}/yellowpaper.md`;
const response = await fetch(source, { signal: AbortSignal.timeout(20_000) });
if (!response.ok) throw new Error(`Paper HTTP ${response.status}`);
const raw = await response.text();
const measuredAt = new Date().toISOString();
const lines = raw.split("\n");
const start = lines.findIndex((line) => /^## 3[. ]/.test(line));
const end = lines.findIndex((line, i) => i > start && /^## 4[. ]/.test(line));
if (start < 0 || end < 0) throw new Error("Paper headings changed");
await save("paper-section3", {
  source,
  measuredAt,
  sha,
  startLine: start + 1,
  raw: lines.slice(start, end).join("\n"),
});
console.log({ section3Lines: end - start, measuredAt });
for (const [name, pattern] of [
  ["parameters", /<a id="param-(sampled_audit_alpha_ppm|audit_quantum_gn|high_value_gn_threshold)"/],
  ["calls", /submit_stark_batch\(proofs|submit_validator_attestations\(bundle|R3.1's presence gate/],
] as const) {
  const excerpts = lines.flatMap((line, i) => (pattern.test(line) ? [{ line: i + 1, raw: line }] : []));
  await save(`paper-${name}`, { source, measuredAt, sha, excerpts });
  console.log(name, excerpts);
}
if (process.argv.includes("--paper-only")) process.exit(0);
const client = new McpClient({ retries: 1, minIntervalMs: 500 });
const query =
  "{ __schema { queryType { fields { name args { name type { kind name ofType { kind name } } } type { kind name ofType { kind name } } } } types { name fields { name type { kind name ofType { kind name ofType { kind name } } } } } } }";
const schema = await client.callTool("flop_indexer_query", { query });
await save("schema", {
  source: "https://mcp.flop.network/mcp",
  tool: "flop_indexer_query",
  args: { query },
  ...schema,
  value: undefined,
});
const s = schema.value as { __schema: { queryType: { fields: { name: string }[] }; types: { name: string }[] } };
console.log(
  JSON.stringify(
    {
      roots: s.__schema.queryType.fields.filter((f) => /poui|settlement/i.test(f.name)),
      types: s.__schema.types.filter((t) => /poui|proof|leaderboard/i.test(t.name)),
    },
    null,
    2,
  ),
);
