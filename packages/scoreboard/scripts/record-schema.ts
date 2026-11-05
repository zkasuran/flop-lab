// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { McpClient } from "../../mcp/src/index";
const query =
  "{ __schema { queryType { name fields { name args { name type { kind name ofType { kind name } } } type { kind name ofType { kind name } } } } } }";
const result = await new McpClient().callTool("flop_indexer_query", { query });
await writeFile(
  new URL("../fixtures/indexer-schema.json", import.meta.url),
  JSON.stringify({
    source: "https://mcp.flop.network/mcp#flop_indexer_query",
    measuredAt: result.measuredAt,
    query,
    raw: result.value,
  }) + "\n",
);
console.log(JSON.stringify({ measuredAt: result.measuredAt, query }));
