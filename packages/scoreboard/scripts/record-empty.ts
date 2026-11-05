// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { McpClient } from "../../mcp/src/index";
const client = new McpClient();
const args = { model: `0x${"0".repeat(64)}`, limit: 100, offset: 0 };
const result = await client.callTool("flop_list_settlements", args);
await writeFile(
  new URL("../fixtures/empty-filter.json", import.meta.url),
  JSON.stringify(
    {
      source: "https://mcp.flop.network/mcp#flop_list_settlements",
      measuredAt: result.measuredAt,
      arguments: args,
      raw: result.value,
      note: "Real empty result for a zero model hash. This is not evidence that the whole network is empty.",
    },
    null,
    2,
  ) + "\n",
);
console.log(result.measuredAt, result.raw);
