#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { runSuite, summarize, versions } from "./index.ts";
import type { Sdk } from "./model.ts";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      sdk: { type: "string" },
      scenario: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "flop-sdkconf run [--json] [--sdk sdk|client|cli|python] [--scenario <id>]\nOffline scripted scenarios. No wallets or public requests.\nExit 0: checks pass; 1: confirmed failure; 2: usage/runner error; 3: skipped coverage.\nOptional Python interpreter: SDKCONF_PYTHON=/path/to/venv/bin/python",
    );
  } else {
    if (positionals.length !== 1 || positionals[0] !== "run") throw new Error("Use flop-sdkconf run or --help");
    if (values.sdk && !Object.hasOwn(versions, values.sdk))
      throw new Error("Unknown SDK. Use sdk, client, cli or python.");
    const report = await runSuite({
      sdk: values.sdk as Sdk | undefined,
      scenario: values.scenario,
      python: process.env.SDKCONF_PYTHON,
    });
    const counts = summarize(report.results);
    if (values.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`SDK conformance | ${report.measuredAt} | ${report.runtime}\n${report.source}\n`);
      for (const r of report.results) {
        console.log(
          `${r.status.padEnd(7)} ${r.sdk}@${r.version} ${r.id}: ${r.title}${r.issue ? ` https://github.com/flop-labs/network/issues/${r.issue}` : ""}`,
        );
        if (r.status === "FAIL")
          for (const a of r.attempts) {
            console.log(`  ${a.measuredAt}: ${a.observed}`);
            for (const t of a.trace)
              console.log(
                `  ${t.sequence}. +${t.atMs}ms ${t.method} ${t.url} -> ${t.status ?? t.outcome}${t.headers["x-payment-proof"] ? " [proof]" : ""}`,
              );
          }
        if (r.status === "SKIPPED") console.log(`  ${r.reason}`);
      }
      console.log(
        `\n${counts.PASS} PASS, ${counts.FAIL} FAIL, ${counts.SKIPPED} SKIPPED | ${report.durationMs} ms | ${report.networkRequests} public requests`,
      );
    }
    process.exitCode = counts.FAIL ? 1 : counts.SKIPPED ? 3 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
