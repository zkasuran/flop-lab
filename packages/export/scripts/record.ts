// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { McpClient } from "@flop-lab/mcp";
import { createReader, type Capture } from "../src/source";
import { datasets, type Plan } from "../src/schema";

const directory = new URL("../fixtures/", import.meta.url);
await mkdir(directory, { recursive: true });
async function save(name: string, value: unknown) {
  const raw = JSON.stringify(value).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`) + "\n";
  if (Buffer.byteLength(raw) > 200_000) throw new Error("Fixture exceeds byte ceiling");
  await writeFile(new URL(`${name}.json`, directory), raw);
}
const client = new McpClient({ retries: 1 });
const query = "{ __schema { queryType { fields { name args { name type { kind name ofType { kind name } } } } } } }";
const schema = await client.callTool("flop_indexer_query", { query });
await save("schema", { source: "https://mcp.flop.network/mcp", query, measuredAt: schema.measuredAt, raw: schema.raw });
console.log(
  "Introspection",
  schema.measuredAt,
  schema.raw.includes('"accounts"') ? "accounts root present" : "no accounts root",
);
let address = "";
let requests = client.stats.requests;
for (const dataset of datasets) {
  const plan: Plan = {
    version: 1,
    dataset,
    format: "ndjson",
    offset: 0,
    rows: 5,
    pageSize: 5,
    addresses: address ? [address] : [],
    archive: "packages/recorder/test/fixtures/seed",
    recorded: false,
  };
  const captures: Capture[] = [];
  const reader = createReader(plan, 4, {
    capture: async (c) => {
      captures.push(c);
    },
  });
  const page = await reader.read(0, 5);
  if (dataset === "settlements") address = String(page.rows[0]?.agent ?? "");
  requests += reader.requests;
  await save(dataset, captures);
  console.log(
    JSON.stringify({
      dataset,
      rows: page.rows.length,
      requests: reader.requests,
      times: page.captures.map((c) => c.measuredAt),
    }),
  );
}
console.log(JSON.stringify({ requests, finishedAt: new Date().toISOString() }));
