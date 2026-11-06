// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { KnowledgeClient, type Observation } from "../src/client";

const client = new KnowledgeClient();
const started = performance.now();
async function save(name: string, observation: Observation<unknown>) {
  const { value: _value, raw, ...metadata } = observation;
  void _value;
  const encoded =
    name === "manifest"
      ? { encoding: "gzip-base64", raw: gzipSync(raw).toString("base64") }
      : { encoding: "text", raw };
  const output =
    JSON.stringify({ ...metadata, ...encoded }, null, 2)
      .replace(/\u2013/g, "\\u2013")
      .replace(/\u2014/g, "\\u2014") + "\n";
  if (Buffer.byteLength(output) > 200_000) throw new Error(`Fixture too large: ${name}`);
  await writeFile(new URL(`../fixtures/${name}.json`, import.meta.url), output);
  console.log(`${name}: ${observation.status}; ${Buffer.byteLength(raw)} raw bytes; ${observation.measuredAt}`);
}
await save("manifest", await client.manifest());
for (const id of ["overview", "agent-pack", "yellowpaper-spec", "source-gaps"])
  await save(id, await client.concept(id));
await save("search", await client.search("agent", 5));
await save("requirement", await client.explain("R9.5"));
await save("pack", await client.pack());
await save("skill", await client.skill("flop-knowledge-catalog"));
await save("guidance", await client.guidance());
await save("card", await client.card(`0x${"0".repeat(64)}`));
console.log(
  JSON.stringify({
    measuredAt: new Date().toISOString(),
    source: "https://mcp.flop.network/mcp",
    requests: client.mcp.stats.requests,
    durationMs: performance.now() - started,
  }),
);
