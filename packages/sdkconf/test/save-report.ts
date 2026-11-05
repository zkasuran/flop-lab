// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { runSuite, summarize } from "../src/index.ts";
const report = await runSuite({ python: process.env.SDKCONF_PYTHON });
// A compact generated recording keeps review focused on the scenario code.
await writeFile(new URL("../fixtures/report.json", import.meta.url), JSON.stringify(report) + "\n");
console.log(
  JSON.stringify({
    measuredAt: report.measuredAt,
    counts: summarize(report.results),
    durationMs: report.durationMs,
    mockedRequests: report.results.flatMap((r) => r.attempts.flatMap((a) => a.trace)).length,
    publicRequests: report.networkRequests,
  }),
);
