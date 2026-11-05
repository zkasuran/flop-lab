// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const results = [];
for (const args of [["--help"], ["bundle", "fixtures/channel-1.json", "--json"]]) {
  const start = performance.now();
  const output = spawnSync(process.execPath, ["dist/cli.js", ...args], { cwd, encoding: "utf8", timeout: 10_000 });
  const durationMs = performance.now() - start;
  if (output.error) throw output.error;
  if (output.status !== (args[0] === "bundle" ? 3 : 0)) throw new Error(output.stderr || output.stdout);
  results.push({
    args,
    durationMs: Number(durationMs.toFixed(3)),
    exitCode: output.status,
    requests:
      args[0] === "bundle" ? (JSON.parse(output.stdout) as { requests: unknown }).requests : "help does not fetch",
  });
}
console.log(
  JSON.stringify(
    { measuredAt: new Date().toISOString(), source: "local Node child processes", node: process.version, results },
    null,
    2,
  ),
);
