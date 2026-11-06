// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { McpClient, DEFAULT_URL } from "@flop-lab/mcp";
import { Collector } from "@flop-lab/scoreboard";

const client = new McpClient({ retries: 1, timeoutMs: 15_000 });
const observations = [];
for (const tool of ["flop_health", "flop_discover_models"]) {
  const result = await client.callTool(tool);
  observations.push({ tool, source: DEFAULT_URL, ...result, value: undefined });
}
const snapshot = await new Collector().snapshot();
const entries = snapshot.records.map((record) => [`${record.kind}.json`, JSON.stringify(record) + "\n"]);
entries.push([
  "devnet.json",
  JSON.stringify(
    { observations, snapshot: { ...snapshot, records: snapshot.records.map((r) => `${r.kind}.json`) } },
    null,
    2,
  ) + "\n",
]);
for (const [name, raw] of entries) {
  if (!name || !raw || Buffer.byteLength(raw) > 200_000) throw new Error("Fixture exceeds size limit");
}
for (const [name, raw] of entries) await writeFile(new URL(`../fixtures/${name}`, import.meta.url), raw!);
console.log(
  JSON.stringify({
    measuredAt: snapshot.measuredAt,
    files: entries.map(([name, raw]) => ({ name, bytes: Buffer.byteLength(raw!) })),
    tools: observations.map((o) => o.tool),
    collection: snapshot.collection,
  }),
);
