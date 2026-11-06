// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { McpClient } from "@flop-lab/mcp";
import { EconomicsCollector } from "../src/observe";
const client = new McpClient({ retries: 1 });
const collector = new EconomicsCollector(client);
const start = performance.now();
const observation = await collector.collect();
const durationMs = performance.now() - start;
await collector.collect();
await writeFile(
  new URL("../fixtures/devnet.json", import.meta.url),
  JSON.stringify(
    { source: observation.source, measuredAt: observation.measuredAt, query: observation.query, raw: observation.raw },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      measuredAt: observation.measuredAt,
      durationMs,
      requestsIncludingCachedRepeat: client.stats.requests,
      data: observation.data,
    },
    null,
    2,
  ),
);
