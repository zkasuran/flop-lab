// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const start = performance.now();
const run = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "--checks", "tape"],
  { encoding: "utf8", timeout: 30_000 },
);
if (run.status !== 0) throw new Error(run.stderr || "Cold process failed");
const report = JSON.parse(run.stdout) as { requests: number; status: string; mode: string };
console.log(
  JSON.stringify({
    measuredAt: new Date().toISOString(),
    source: "fresh Node process running dist/cli.js --checks tape",
    wallMs: Math.round(performance.now() - start),
    requests: report.requests,
    status: report.status,
    mode: report.mode,
  }),
);
