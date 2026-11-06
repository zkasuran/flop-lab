// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createObserver, recordedReport } from "../src/index";

const output = process.argv[2];
if (!output) throw new Error("Pass an evidence output path");
const start = performance.now();
const cli = spawnSync(process.execPath, ["packages/staking/dist/cli.js", "miner", "--gflop", "1", "--json"], {
  encoding: "utf8",
});
const coldStartMs = performance.now() - start;
if (cli.status !== 0) throw new Error(cli.stderr);
const observer = createObserver();
const live = await observer.run(),
  cached = await observer.run();
const report = recordedReport();
const result = {
  measuredAt: new Date().toISOString(),
  coldStartMs,
  cliRequests: 0,
  recorded: {
    miners: report.miners.length,
    calibrated: report.miners.filter((r) => r.capacityGflop !== null).length,
    positions: report.positions.length,
    totals: report.totals,
  },
  live: { durationMs: live.durationMs, requests: live.requests, errors: live.errors, sources: live.sources },
  cacheRequests: cached.requests,
};
await writeFile(output, JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      ...result,
      live: { ...result.live, sources: live.sources.map(({ source, measuredAt }) => ({ source, measuredAt })) },
    },
    null,
    2,
  ),
);
