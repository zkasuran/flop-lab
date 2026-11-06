// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { DEFAULT_URL, McpClient, readIndexer } from "@flop-lab/mcp";

const client = new McpClient({ retries: 1, minIntervalMs: 500 });
const positions = await readIndexer(client, "sponsorPositions", { limit: 100, offset: 0 });
async function save(name: string, data: unknown) {
  const text = JSON.stringify(data).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  if (Buffer.byteLength(text) > 200_000) throw new Error("Fixture too large");
  await writeFile(new URL(`../fixtures/${name}.json`, import.meta.url), text + "\n");
}
await save("positions", { ...positions, value: undefined, source: DEFAULT_URL });
console.log("positions", JSON.stringify(positions.value).slice(0, 1800));
for (const [name, path] of [
  ["miners", "/api/miners?limit=100"],
  ["stake-stats", "/api/staking/stats"],
]) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const source = `https://explorer.devnet.flop.network${path}`;
  const r = await fetch(source, { headers: { "User-Agent": "flop-lab/staking" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const raw = await r.text();
  await save(name!, { source, measuredAt: new Date().toISOString(), raw });
  console.log(name, raw.slice(0, 2500));
}
