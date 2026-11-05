// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { McpClient } from "../../mcp/src/index";
import { array, hash, object } from "../src/schema";

const client = new McpClient({ retries: 1, minIntervalMs: 400 });
const source = "https://mcp.flop.network/mcp";
const fields =
  "hashLock htlcId sender recipient amount timeout status paymentStatus evidenceStatus verifierRef timeoutPath observationHead preImage gnUsed receiptHash createdAt settledAt refundedAt blockHash blockNumber";
const query = `{ htlcs(limit: 5, status: "SETTLED") { ${fields} } }`;
const result = await client.callTool("flop_indexer_query", { query });
await writeFile(
  new URL("../fixtures/v2-settled-htlcs.json", import.meta.url),
  JSON.stringify({ source, tool: "flop_indexer_query", args: { query }, ...result }, null, 2) + "\n",
);
const rows = array(object(result.value, "response").htlcs, "htlcs");
console.log("Settled sample rows", rows.length);
const hashLock = rows[0]
  ? hash(object(rows[0], "htlc").hashLock, "hashLock")
  : "0x79abe3554fc8b5fd22b8c5c520ffb7f274a98d2d047691d491f467d0e78cf96a";
for (const [label, tool, args] of [
  ["htlc-check", "flop_check_htlc", { hash_lock: hashLock }],
  ["receipt", "flop_get_inference_receipt", { hash_lock: hashLock }],
  [
    "htlc-index",
    "flop_indexer_query",
    { query: `query($hash: String!) { htlc(hashLock: $hash) { ${fields} } }`, variables: { hash: hashLock } },
  ],
] as const) {
  const result = await client.callTool(tool, args);
  await writeFile(
    new URL(`../fixtures/v2-${label}.json`, import.meta.url),
    JSON.stringify({ source, tool, args, ...result }, null, 2) + "\n",
  );
  console.log(label, result.raw);
}
