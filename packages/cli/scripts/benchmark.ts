// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const samples = [];
for (const args of [["--help"], ["which", "miner", "reliability", "--json"]]) {
  const durationMs = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    const child = spawnSync(process.execPath, [resolve(root, "packages/cli/dist/cli.js"), ...args], {
      cwd: root,
      env: { ...process.env, NODE_OPTIONS: `--require=${resolve(root, "packages/cli/scripts/offline.cjs")}` },
      encoding: "utf8",
      timeout: 5000,
    });
    if (child.status !== 0 || child.error) throw new Error(child.error?.message ?? child.stderr);
    durationMs.push(Math.round((performance.now() - start) * 100) / 100);
  }
  const sorted = [...durationMs].sort((a, b) => a - b);
  samples.push({ args, durationMs, medianMs: sorted[2], minMs: sorted[0], maxMs: sorted[4] });
}
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      source:
        "local built packages/cli/dist/cli.js; fresh process per sample; filesystem cache not cleared; network blocked",
      samples,
    },
    null,
    2,
  ),
);
