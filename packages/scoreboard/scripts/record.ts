// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { Collector } from "../src/index";

const tag = process.argv[2] ?? "01";
if (!/^\d\d$/.test(tag)) throw new Error("use a two-digit recording tag");
const snapshot = await new Collector().snapshot();
if (snapshot.reliability) {
  const evidence = JSON.stringify(snapshot.reliability) + "\n";
  console.log(JSON.stringify({ reliabilityBytes: Buffer.byteLength(evidence), miners: snapshot.reliability.miners.length }));
  if (Buffer.byteLength(evidence) > 200_000) throw new Error("reliability fixture exceeds size limit");
  await writeFile(new URL(`../fixtures/reliability-${tag}.json`, import.meta.url), evidence);
  delete snapshot.reliability;
}
if (snapshot.reliabilityError) console.log(JSON.stringify({ reliabilityError: snapshot.reliabilityError }));
const path = new URL(`../fixtures/snapshot-${tag}.json`, import.meta.url);
const json = JSON.stringify(snapshot) + "\n";
if (Buffer.byteLength(json) > 200_000) throw new Error("fixture exceeds size limit");
await writeFile(path, json);
console.log(
  JSON.stringify({
    path: path.pathname,
    measuredAt: snapshot.measuredAt,
    bytes: Buffer.byteLength(json),
    ...snapshot.collection,
  }),
);
