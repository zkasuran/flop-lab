// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { EvidenceFetcher, verifyEvidence } from "../src/index";

const fetcher = new EvidenceFetcher({ ttlMs: 120_000 });
const directory = new URL("../fixtures/", import.meta.url);
await mkdir(directory, { recursive: true });
const tape = await fetcher.tape(1000);
for (const obs of tape.observations) {
  await writeFile(new URL(`${obs.id.replace(":", "-")}.json`, directory), `${JSON.stringify(obs, null, 2)}\n`);
}
const candidates = tape.rows.slice(0, 5);
const reports = [];
for (const [index, row] of candidates.entries()) {
  const bundle = await fetcher.channel(row.channelId);
  const encoded = `${JSON.stringify(bundle, null, 2)}\n`;
  if (Buffer.byteLength(encoded) > 200_000) throw new Error("Fixture exceeds 200 KB; use smaller per-channel capture");
  await writeFile(new URL(`channel-${index + 1}.json`, directory), encoded);
  const report = await verifyEvidence(bundle);
  reports.push({
    channelId: row.channelId,
    bytes: Buffer.byteLength(encoded),
    checks: report.checks.map(({ id, status, detail }) => ({ id, status, detail })),
  });
}
const summary = {
  capturedAt: tape.capturedAt,
  source: tape.source,
  tapeRows: tape.rows.length,
  complete: tape.complete,
  requests: fetcher.stats,
  tapeExitCode: tape.exitCode,
  reports,
};
await writeFile(new URL("recording.json", directory), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
