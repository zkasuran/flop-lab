// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compare, createRuntimeReader, recordedReport, recordedSpec } from "../src/index";

const output = process.argv[2];
if (!output) throw new Error("Pass an evidence JSON path");
const started = performance.now();
const child = spawnSync(process.execPath, ["dist/cli.js", "diff", "--json"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  encoding: "utf8",
});
const coldStartMs = performance.now() - started;
if (child.status !== 0) throw new Error(`Recorded CLI failed: ${child.status}`);
const begin = performance.now();
const reader = createRuntimeReader();
const live = await reader();
const durationMs = performance.now() - begin;
const repeat = await reader();
const report = compare(recordedSpec(), live.runtime, { mode: "live", at: new Date().toISOString() });
await writeFile(
  output,
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      command: "node dist/cli.js diff --json",
      source: "https://mcp.flop.network/mcp",
      sha: report.sha,
      coldStartMs,
      liveDurationMs: durationMs,
      liveRequests: live.requests,
      cacheRepeatRequests: repeat.requests - live.requests,
      counts: report.counts,
      recordedCounts: recordedReport().counts,
      warnings: report.warnings,
      records: live.records,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    coldStartMs,
    liveDurationMs: durationMs,
    liveRequests: live.requests,
    cacheRepeatRequests: repeat.requests - live.requests,
    counts: report.counts,
    warnings: report.warnings,
  }),
);
