// SPDX-License-Identifier: Apache-2.0
import { writeFileSync } from "node:fs";
import { collectTape } from "../src/watcher";
import { recordedClient } from "../src/recorded";
import { analyze } from "../src/core";
import { draftDossier } from "../src/dossier";
import { recordedEvidence } from "../src/recorded-evidence";

// Derive a bundle-safe fallback from retained raw responses. No network calls.
const { client, options } = recordedClient();
const tape = await collectTape(client, { ...options, maxRows: 100 });
const report = analyze(tape, options.now());
const dossier = await draftDossier(report, tape.settlements[0]!.channelId, client, undefined, {
  bundle: await recordedEvidence(tape.settlements[0]!.channelId),
});
const snapshot = {
  ...tape,
  settlements: tape.settlements.map((row) => row.raw),
  evidence: dossier.evidence,
};
const output = JSON.stringify(snapshot);
if (Buffer.byteLength(output) > 200_000) throw new Error("Fallback exceeds fixture size limit");
writeFileSync(new URL("../fixtures/site.json", import.meta.url), `${output}\n`);
console.log(
  JSON.stringify({ bytes: Buffer.byteLength(output), rows: tape.settlements.length, measuredAt: tape.measuredAt }),
);
