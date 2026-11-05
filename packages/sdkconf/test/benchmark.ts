// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parseReport, summarize } from "../src/model.ts";

const measuredAt = new Date().toISOString();
const start = performance.now();
const { stdout } = await promisify(execFile)(
  process.execPath,
  [fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "run", "--sdk", "client", "--json"],
  { timeout: 45000, maxBuffer: 200000 },
);
const coldStartMs = Math.round((performance.now() - start) * 100) / 100;
const report = parseReport(JSON.parse(stdout));
console.log(
  JSON.stringify(
    {
      measuredAt,
      source: "fresh Node subprocess running dist/cli.js run --sdk client --json",
      runtime: process.version,
      coldStartMs,
      counts: summarize(report.results),
      mockRequests: report.results.flatMap((r) => r.attempts.flatMap((a) => a.trace)).length,
      publicRequests: report.networkRequests,
    },
    null,
    2,
  ),
);
