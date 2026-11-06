// SPDX-License-Identifier: Apache-2.0
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";

// A normal build can leave live observations in Next's persistent data cache.
rmSync(new URL("../.next/", import.meta.url), { recursive: true, force: true });
const run = spawnSync(
  process.execPath,
  ["--import", new URL("./offline.mjs", import.meta.url).href, "./node_modules/next/dist/bin/next", "build"],
  {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "inherit",
  },
);
if (run.error) process.stderr.write(`${run.error.message}\n`);
process.exit(run.status ?? 1);
