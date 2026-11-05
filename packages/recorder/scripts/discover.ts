// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { Transport } from "@flop-lab/harness";

const dir = new URL("../test/fixtures/schema/", import.meta.url);
await mkdir(dir, { recursive: true });
const transport = new Transport({ maxRequests: 8 });
const query = `{ statsType: __type(name: "Stats") { fields { name type { kind name ofType { kind name } } } } valueType: __type(name: "NetworkValue") { fields { name type { kind name ofType { kind name } } } } blockType: __type(name: "Block") { fields { name type { kind name ofType { kind name } } } } }`;
const result = await transport.client.callTool("flop_indexer_query", { query });
console.log(JSON.stringify(result.value));
for (const item of transport.evidence) {
  await writeFile(new URL(`${item.id}.json`, dir), JSON.stringify(item, null, 2) + "\n");
}
