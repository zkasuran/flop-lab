// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import { runHarness } from "../src/runner";
import { compactReport, renderMarkdown } from "../src/report";
import { serialize } from "../src/validation";

const report = await runHarness({ maxRequests: 100, maxFlop: "0" });
await mkdir(new URL("../fixtures/", import.meta.url), { recursive: true });
for (const name of await readdir(new URL("../fixtures/", import.meta.url))) {
  if (/^run-\d+\.json$/.test(name)) await unlink(new URL(`../fixtures/${name}`, import.meta.url));
}
for (const evidence of report.evidence)
  await writeFile(new URL(`../fixtures/run-${evidence.id}.json`, import.meta.url), serialize(evidence, 0));
const compact = compactReport(report);
await writeFile(new URL("../last-run.json", import.meta.url), serialize(compact, 0));
await writeFile(new URL("../last-run.md", import.meta.url), renderMarkdown(compact));
console.log(
  serialize({
    measuredAt: report.measuredAt,
    requests: report.budget.requests,
    durationMs: report.durationMs,
    results: report.results.map((result) => ({
      id: result.claim.id,
      status: result.status,
      flaky: result.flaky,
      reason: result.reason,
    })),
  }),
);
