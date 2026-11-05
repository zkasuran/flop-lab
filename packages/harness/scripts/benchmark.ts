// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serialize } from "../src/validation";
const samples: number[] = [];
for (let index = 0; index < 5; index++) {
  const start = performance.now();
  const child = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "--help"], {
    encoding: "utf8",
  });
  if (child.status !== 0) throw new Error(child.stderr);
  samples.push(performance.now() - start);
}
const sorted = [...samples].sort((a, b) => a - b);
console.log(
  serialize({
    measuredAt: new Date().toISOString(),
    source: "local Node process wall clock, built CLI --help",
    node: process.version,
    samplesMs: samples,
    medianMs: sorted[Math.floor(sorted.length / 2)],
  }),
);
