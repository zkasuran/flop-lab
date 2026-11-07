// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const dir = await mkdtemp(join(tmpdir(), "flop-action-local-"));
try {
  const output = join(dir, "output"),
    summary = join(dir, "summary");
  const run = spawnSync(
    process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("../src/cli.ts", import.meta.url)), "--github"],
    {
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        RUNNER_TEMP: dir,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        INPUT_CHECKS: "tape",
        INPUT_MODE: "recorded",
        INPUT_MAX_REQUESTS: "0",
        INPUT_FAIL_ON_INCOMPLETE: "true",
      },
    },
  );
  assert.equal(run.status, 0, run.stderr);
  const values = Object.fromEntries(
    (await readFile(output, "utf8"))
      .trim()
      .split("\n")
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  assert.equal(values.status, "pass");
  assert.equal(values.requests, "0");
  const report = JSON.parse(await readFile(values.report!, "utf8")) as {
    status: string;
    requests: number;
    evaluatedAt: string;
  };
  assert.equal(report.status, "pass");
  assert.equal(report.requests, 0);
  assert.match(await readFile(summary, "utf8"), /\| tape \| pass \|/);
  console.log(
    JSON.stringify({
      runner: "local composite-step protocol",
      measuredAt: report.evaluatedAt,
      status: report.status,
      requests: report.requests,
      outputs: Object.keys(values),
      summary: "written and checked",
    }),
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
