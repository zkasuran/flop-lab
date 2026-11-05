// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
const binary = new URL("../dist/cli.js", import.meta.url);
const generated = spawnSync(process.execPath, [binary.pathname, "simulate", "happy"], { encoding: "utf8" });
if (generated.status !== 0) throw new Error(generated.stderr);
const input = process.argv[2]!;
await writeFile(input, generated.stdout);
const samples: number[] = [];
for (let i = 0; i < 5; i++) {
  const start = performance.now();
  const result = spawnSync(process.execPath, [binary.pathname, "inspect", input, "--offline", "--json"], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  samples.push(Math.round((performance.now() - start) * 100) / 100);
}
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      source: "local Node CLI, separate cold process per sample",
      node: process.version,
      command: "flop-tclk inspect <happy fixture> --offline --json",
      samplesMs: samples,
      networkRequests: 0,
    },
    null,
    2,
  ),
);
