// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { McpClient, indexerQuery, DEFAULT_URL } from "@flop-lab/mcp";

const query = '{ __type(name: "Query") { fields { name description } } }';
const result = await indexerQuery(new McpClient({ retries: 1 }), query);
await writeFile(
  new URL("../fixtures/schema.json", import.meta.url),
  JSON.stringify({ source: DEFAULT_URL, query, measuredAt: result.measuredAt, raw: result.raw }, null, 2) + "\n",
);
console.log(`Recorded schema descriptions at ${result.measuredAt}`);
