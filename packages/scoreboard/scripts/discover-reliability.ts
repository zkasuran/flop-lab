// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { McpClient } from "../../mcp/src/index";

const client = new McpClient();
const type = "kind name ofType { kind name ofType { kind name ofType { kind name } } }";
const fields = `name description args { name type { ${type} } } type { ${type} }`;
const names = [
  "minerReliability",
  "minerReliabilitySeries",
  "minerGhostStatsSnapshots",
  "reliabilityEvents",
  "pouiLeaderboard",
];
const query = `{ __schema { queryType { fields { ${fields} } } } }`;
const root = await client.callTool("flop_indexer_query", { query });
await writeFile(
  new URL("../fixtures/reliability-schema-root.json", import.meta.url),
  JSON.stringify({ source: "https://mcp.flop.network/mcp", measuredAt: root.measuredAt, query, raw: root.value }) +
    "\n",
);
type Type = { name: string | null; ofType?: Type };
type Field = { name: string; type: Type };
const selected = (root.value as { __schema: { queryType: { fields: Field[] } } }).__schema.queryType.fields.filter(
  (f) => names.includes(f.name),
);
console.log(JSON.stringify(selected, null, 2));
const unwrap = (t: Type): string => t.name ?? unwrap(t.ofType!);
const pending = [...new Set(selected.map((f) => unwrap(f.type)))];
const seen = new Set<string>();
while (pending.length) {
  const name = pending.shift()!;
  if (seen.has(name)) continue;
  seen.add(name);
  const query = `{ __type(name: ${JSON.stringify(name)}) { name fields { ${fields} } } }`;
  const result = await client.callTool("flop_indexer_query", { query });
  await writeFile(
    new URL(`../fixtures/reliability-schema-${name}.json`, import.meta.url),
    JSON.stringify({
      source: "https://mcp.flop.network/mcp",
      measuredAt: result.measuredAt,
      query,
      raw: result.value,
    }) + "\n",
  );
  const schema = (result.value as { __type: { fields: Field[] } }).__type;
  console.log(name, JSON.stringify(schema.fields));
  for (const f of schema.fields) {
    const child = unwrap(f.type);
    if (!["String", "Int", "Float", "Boolean", "ID"].includes(child)) pending.push(child);
  }
}
