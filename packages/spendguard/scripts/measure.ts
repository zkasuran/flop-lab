// SPDX-License-Identifier: Apache-2.0
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
const probe = `import { Socket } from 'node:net'; let connections = 0; const original = Socket.prototype.connect; Socket.prototype.connect = function(...args) { connections++; return original.apply(this, args); }; process.on('exit', () => process.stderr.write(JSON.stringify({ socketConnections: connections })));`;
const started = performance.now();
const result = spawnSync(
  process.execPath,
  [
    "--import",
    `data:text/javascript,${encodeURIComponent(probe)}`,
    "dist/cli.js",
    "evaluate",
    "examples/policy.json",
    "examples/request.json",
    "--dry-run",
  ],
  { encoding: "utf8" },
);
if (result.status !== 0) throw new Error(result.stderr);
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      source: "local cold CLI process with net.Socket.connect instrumentation",
      command: "node dist/cli.js evaluate examples/policy.json examples/request.json --dry-run",
      durationMs: performance.now() - started,
      socketConnections: JSON.parse(result.stderr).socketConnections,
      decision: JSON.parse(result.stdout).decision,
    },
    null,
    2,
  ),
);
