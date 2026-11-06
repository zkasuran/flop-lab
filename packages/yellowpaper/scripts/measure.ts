// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRuntimeReader } from "@flop-lab/spec";
import { recordedReader } from "../src/recorded";

const destination = process.argv[2];
if (!destination) throw new Error("Expected evidence directory");
const started = performance.now();
const reader = recordedReader();
const parseMs = performance.now() - started;
const cold = performance.now();
const cli = spawnSync(process.execPath, ["dist/cli.js", "parameter", "channel_dispute_window_blocks", "--json"], {
  encoding: "utf8",
});
const coldStartMs = performance.now() - cold;
if (cli.status !== 0) throw new Error(cli.stderr);
const read = createRuntimeReader();
const liveStart = performance.now();
const live = await read();
const liveMs = performance.now() - liveStart;
const repeat = await read();
const result = {
  measuredAt: new Date().toISOString(),
  sha: reader.sha,
  bytes: reader.bytes,
  headings: reader.headings.length,
  glossary: reader.glossary.length,
  parameters: reader.parameters.length,
  openItems: reader.openItems.length,
  searchEntries: reader.search.length,
  unresolvedLinks: reader.unresolvedLinks,
  parseMs,
  coldStartMs,
  liveMs,
  requests: live.requests,
  cachedAdditionalRequests: repeat.requests - live.requests,
  catalogAvailable: live.runtime.catalogAvailable,
  catalogParameters: live.runtime.parameters.length,
};
await writeFile(`${destination}/MEASURE.json`, JSON.stringify(result, null, 2) + "\n");
for (const [name, recording] of Object.entries(live.records)) {
  const encoded = JSON.stringify(recording).replace(
    /[\u2013\u2014]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16)}`,
  );
  if (Buffer.byteLength(encoded) <= 200_000) await writeFile(`${destination}/live-${name}.json`, encoded + "\n");
}
console.log(JSON.stringify(result, null, 2));
