// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { McpClient, DEFAULT_URL } from "@flop-lab/mcp";

const dir = new URL("../fixtures/", import.meta.url);
await mkdir(dir, { recursive: true });
async function save(name: string, data: unknown) {
  const text = JSON.stringify(data).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  if (Buffer.byteLength(text) > 200_000) throw new Error(`${name} too large`);
  await writeFile(new URL(`${name}.json`, dir), text + "\n");
}
const client = new McpClient({ retries: 1, minIntervalMs: 500 });
for (const [name, tool, args] of [
  ["catalog", "flop_knowledge_get", { id_or_path: "protocol-params" }],
  [
    "schema",
    "flop_indexer_query",
    {
      query:
        "{ __schema { queryType { fields { name args { name type { kind name ofType { kind name } } } type { kind name ofType { kind name } } } } } }",
    },
  ],
  [
    "sponsor-schema",
    "flop_indexer_query",
    { query: '{ __type(name: "SponsorPosition") { name fields { name type { kind name ofType { kind name } } } } }' },
  ],
] as const) {
  const r = await client.callTool(tool, args);
  await save(name, { source: DEFAULT_URL, tool, args, ...r, value: undefined });
  console.log(name, r.measuredAt, Buffer.byteLength(r.raw));
  if (name === "catalog") console.log(r.raw.slice(0, 1500));
  else console.log("Recorded introspection");
}
for (const path of ["staking-and-slashing", "protocol-parameters"]) {
  const source = `https://docs.flop.network/docs/${path}`;
  const response = await fetch(source, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const raw = await response.text();
  await save(path, { source, measuredAt: new Date().toISOString(), raw });
  console.log(path, Buffer.byteLength(raw));
}
