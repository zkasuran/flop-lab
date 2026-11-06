// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { createCollector } from "../src/live";
import { analyzeRecording } from "../src/report";
const dir = new URL("../fixtures/", import.meta.url);
await mkdir(dir, { recursive: true });
const read = createCollector();
const recording = await read(1000);
const files: string[] = [];
for (const [i, capture] of recording.captures.entries()) {
  const raw = JSON.stringify(capture).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  if (Buffer.byteLength(raw) > 200_000) throw new Error("Capture exceeds byte ceiling");
  const filename = `capture-${i}.json`;
  files.push(filename);
  await writeFile(new URL(filename, dir), raw + "\n");
}
await writeFile(
  new URL("manifest.json", dir),
  JSON.stringify({ ...recording, captures: undefined, files }, null, 2) + "\n",
);
const report = analyzeRecording(recording);
const cached = await read(1000);
console.log(
  JSON.stringify(
    {
      measuredAt: recording.finishedAt,
      requests: recording.requests,
      durationMs: recording.durationMs,
      captures: files,
      proofs: report.proofs,
      leaderboard: report.leaderboard,
      settlements: {
        count: report.settlements.value?.rows.length,
        complete: report.settlements.value?.complete,
        reason: report.settlements.reason,
      },
      proofs24h: report.stats.value?.proofs24h,
      cacheRetainedTimestamp: cached.finishedAt === recording.finishedAt,
    },
    null,
    2,
  ),
);
