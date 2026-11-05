// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { EvidenceFetcher, verifyEvidence } from "../src/index";

const fetcher = new EvidenceFetcher();
const tape = await fetcher.tape(1);
const id = tape.rows[0]?.channelId;
if (!id) throw new Error("No public settlement available to record");
const bundle = await fetcher.channel(id);
const report = await verifyEvidence(bundle);
await writeFile(new URL("../fixtures/v2-channel.json", import.meta.url), JSON.stringify(bundle, null, 2) + "\n");
const measured = {
  source: "https://mcp.flop.network/mcp",
  capturedAt: bundle.capturedAt,
  stats: fetcher.stats,
  bytes: Buffer.byteLength(JSON.stringify(bundle)),
  checks: report.checks.map(({ id, status, detail }) => ({ id, status, detail })),
};
await writeFile(new URL("../fixtures/v2-recording.json", import.meta.url), JSON.stringify(measured, null, 2) + "\n");
console.log(JSON.stringify(measured, null, 2));
