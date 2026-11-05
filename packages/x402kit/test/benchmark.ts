// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
const results = [];
for (let i = 0; i < 5; i++) {
  const start = performance.now();
  const result = spawnSync(process.execPath, ["dist/cli.js", "--help"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  results.push(Number((performance.now() - start).toFixed(2)));
}
console.log(
  JSON.stringify({
    measuredAt: new Date().toISOString(),
    source: "local Node 22 subprocess, dist/cli.js --help",
    samplesMs: results,
    requests: 0,
  }),
);
