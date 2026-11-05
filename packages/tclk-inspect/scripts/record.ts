// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { McpClient, DEFAULT_URL } from "@flop-lab/mcp";
import { UPSTREAM_COMMIT } from "../src/model";
const folder = new URL("../fixtures/", import.meta.url);
const save = async (name: string, value: unknown) =>
  writeFile(
    new URL(name, folder),
    JSON.stringify(value, null, 2).replace(
      /[\u0080-\uffff]/g,
      (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
    ) + "\n",
  );
const source = `https://raw.githubusercontent.com/flop-labs/tclk/${UPSTREAM_COMMIT}/schema/tclk1-frames.schema.json`;
const response = await fetch(source);
if (!response.ok) throw new Error(`schema HTTP ${response.status}`);
await save("schema.json", {
  source,
  measuredAt: new Date().toISOString(),
  commit: UPSTREAM_COMMIT,
  raw: await response.text(),
});
const client = new McpClient({ retries: 1 });
const tools = await client.listTools();
console.log(JSON.stringify(tools.value.filter((t) => ["flop_check_htlc", "flop_indexer_query"].includes(t.name))));
const query = '{ __type(name: "Query") { fields { name args { name type { kind name ofType { kind name } } } } } }';
const introspection = await client.callTool("flop_indexer_query", { query });
await save("introspection.json", { source: DEFAULT_URL, tool: "flop_indexer_query", query, ...introspection });
console.log("Recorded schema and indexer query arguments", client.stats);
const htlcQuery =
  "{ htlcs(limit: 100, offset: 0) { hashLock htlcId status amount sender recipient timeout blockNumber } }";
const htlcs = await client.callTool("flop_indexer_query", { query: htlcQuery });
await save("htlcs.json", { source: DEFAULT_URL, tool: "flop_indexer_query", query: htlcQuery, ...htlcs });
const hash = "0x648aa5c579fb30f38af744d97d6ec840c7a91277a499a0d780f3e7314eca090b";
const checked = await client.callTool("flop_check_htlc", { hash_lock: hash });
await save("check-absent.json", {
  source: DEFAULT_URL,
  tool: "flop_check_htlc",
  arguments: { hash_lock: hash },
  ...checked,
});
console.log(JSON.stringify({ check: checked.value, requests: client.stats }));
const first = (htlcs.value as { htlcs?: { hashLock: string }[] }).htlcs?.[0];
if (first) {
  const known = await client.callTool("flop_check_htlc", { hash_lock: first.hashLock });
  await save("check-observed.json", {
    source: DEFAULT_URL,
    tool: "flop_check_htlc",
    arguments: { hash_lock: first.hashLock },
    ...known,
  });
  console.log(JSON.stringify({ observed: known.value, requests: client.stats }));
}
