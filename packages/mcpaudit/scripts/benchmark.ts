// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
const samples = [];
for (let sample = 0; sample < 3; sample++) {
  const start = performance.now();
  const result = spawnSync(process.execPath, [new URL("../dist/cli.js", import.meta.url).pathname, "--help"], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  samples.push(Math.round((performance.now() - start) * 100) / 100);
}
console.log(
  JSON.stringify({
    measuredAt: new Date().toISOString(),
    source: "local Node process launch through CLI --help exit",
    node: process.version,
    coldStartMs: samples,
  }),
);
