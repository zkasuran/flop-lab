// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const samples: number[] = [];
for (let i = 0; i < 5; i++) {
  const start = performance.now();
  const output = execFileSync(process.execPath, [cli, "watch", "--recorded", "--json", "--limit", "5"], {
    encoding: "utf8",
    maxBuffer: 4_000_000,
  });
  const report = JSON.parse(output) as { rankingCohort: number; tape: { requests: number; mode: string } };
  if (report.rankingCohort !== 336 || report.tape.mode !== "recorded" || report.tape.requests !== 7)
    throw new Error("Unexpected replay benchmark data");
  samples.push(Number((performance.now() - start).toFixed(3)));
}
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      source: "Local Node child processes replaying fixtures/manifest.json",
      node: process.version,
      command: "node dist/cli.js watch --recorded --json --limit 5",
      coldProcessMs: samples,
      meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
      rowsPerRun: 336,
      replayRequestsPerRun: 7,
      networkRequests: 0,
    },
    null,
    2,
  ),
);
