#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { parseOptions, runChecks } from "./index";
import { writeGithub } from "./github";

try {
  const { values } = parseArgs({
    strict: true,
    options: {
      checks: { type: "string" },
      mode: { type: "string" },
      "max-requests": { type: "string" },
      "fail-on-incomplete": { type: "string" },
      github: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help)
    console.log(
      "flop-action [--checks tape,spec,contracts] [--mode recorded|live] [--max-requests 10] [--fail-on-incomplete true|false]\nJSON output. Exit 0: pass or explicitly allowed incomplete. Exit 1: failed check. Exit 2: incomplete or invalid input.\n--github reads INPUT_* and writes GITHUB_OUTPUT and GITHUB_STEP_SUMMARY.",
    );
  else {
    if (values.github && (!process.env.GITHUB_OUTPUT || !process.env.GITHUB_STEP_SUMMARY))
      throw new Error("GitHub output and summary paths are required");
    if (
      values.github &&
      [values.checks, values.mode, values["max-requests"], values["fail-on-incomplete"]].some(
        (value) => value !== undefined,
      )
    )
      throw new Error("--github uses INPUT_* instead of CLI check options");
    const options = values.github
      ? parseOptions({
          checks: process.env.INPUT_CHECKS,
          mode: process.env.INPUT_MODE,
          maxRequests: process.env.INPUT_MAX_REQUESTS,
          failOnIncomplete: process.env.INPUT_FAIL_ON_INCOMPLETE,
        })
      : parseOptions({
          checks: values.checks,
          mode: values.mode,
          maxRequests: values["max-requests"],
          failOnIncomplete: values["fail-on-incomplete"],
        });
    const report = await runChecks(options);
    if (values.github) await writeGithub(report, process.env);
    console.log(JSON.stringify(report));
    process.exitCode = report.exitCode;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Action failed");
  process.exitCode = 2;
}
