// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import {
  McpClient,
  listSettlements,
  getStats,
  getComputeChannel,
  getTrustRoot,
  indexerQuery,
} from "../../mcp/src/index";

const directory = new URL("../fixtures/", import.meta.url);
await mkdir(directory, { recursive: true });
const observations: unknown[] = [];
let sequence = 0;
const client = new McpClient({
  retries: 1,
  fetch: async (url, init) => {
    const response = await fetch(url, init);
    const raw = await response.clone().text();
    const request: unknown = JSON.parse(String(init?.body));
    const encoded = /[\u2013\u2014]/.test(raw);
    const file = `${String(++sequence).padStart(2, "0")}.sse${encoded ? ".base64" : ""}`;
    const stored = encoded ? Buffer.from(raw).toString("base64") + "\n" : raw;
    if (Buffer.byteLength(stored) > 200_000) throw new Error("Recording exceeds fixture size limit");
    await writeFile(new URL(file, directory), stored);
    observations.push({
      file,
      source: String(url),
      measuredAt: new Date().toISOString(),
      request,
      status: response.status,
    });
    await writeFile(new URL("manifest.json", directory), JSON.stringify(observations, null, 2) + "\n");
    return response;
  },
});
const tools = await client.listTools();
console.log(
  JSON.stringify(
    tools.value.filter((t) => /block|channel|receipt|trust|indexer|audit|dispute/.test(t.name)),
    null,
    2,
  ),
);
const settlements = await listSettlements(client, { limit: 100, offset: 0 });
console.log("settlements", settlements.value.data.length, "total", settlements.value.total);
const stats = await getStats(client);
console.log("stats", stats.value);
const first = settlements.value.data[0];
if (first) console.log("channel", (await getComputeChannel(client, first.channelId)).value);
console.log("block-new", (await client.callTool("flop_get_block", { number: stats.value.latestBlockNumber })).value);
console.log(
  "block-old",
  (await client.callTool("flop_get_block", { number: stats.value.latestBlockNumber - 100 })).value,
);
console.log("trust", (await getTrustRoot(client)).value);
console.log(
  "schema",
  (
    await indexerQuery(
      client,
      "{ __schema { queryType { fields { name type { kind name ofType { kind name } } args { name type { kind name ofType { kind name } } } } } } }",
    )
  ).value,
);
for (let offset = 100; offset < settlements.value.total && offset < 1000; offset += 100) {
  const page = await listSettlements(client, { limit: 100, offset });
  console.log("page", offset, page.value.data.length);
  if (!page.value.hasMore) break;
}
