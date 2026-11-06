// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildReport, capture, createReader } from "../src/index";

const starts = [];
for (let i = 0; i < 3; i++) {
  const start = performance.now();
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "--json"], {
    encoding: "utf8",
    maxBuffer: 4_000_000,
  });
  if (run.status !== 0) throw new Error(run.stderr);
  const report = JSON.parse(run.stdout) as { events: unknown[]; requestsThisRun: number };
  starts.push({
    durationMs: performance.now() - start,
    events: report.events.length,
    requests: report.requestsThisRun,
  });
}
const reader = createReader();
const first = await capture({ reader }),
  second = await capture({ reader });
const files = await readdir(new URL("../fixtures/", import.meta.url));
const sizes = await Promise.all(
  files.map(async (file) => ({ file, bytes: (await stat(new URL(`../fixtures/${file}`, import.meta.url))).size })),
);
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      node: process.version,
      coldStart: starts,
      live: {
        requests: first.requests,
        durationMs: first.durationMs,
        events: buildReport(first).events.length,
        gaps: buildReport(first).gaps,
      },
      cacheRepeat: { requests: second.requests, durationMs: second.durationMs },
      largestFixture: sizes.sort((a, b) => b.bytes - a.bytes)[0],
    },
    null,
    2,
  ),
);
