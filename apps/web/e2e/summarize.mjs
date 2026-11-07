// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import process from "node:process";
import { Buffer } from "node:buffer";
import { URL } from "node:url";

const report = JSON.parse(
  readFileSync(process.argv[2] ?? new URL("./artifacts/results.json", import.meta.url), "utf8"),
);
function* specs(suites) {
  for (const suite of suites) {
    yield* suite.specs ?? [];
    yield* specs(suite.suites ?? []);
  }
}
const rows = [];
for (const spec of specs(report.suites)) {
  for (const test of spec.tests) {
    const result = test.results.at(-1);
    const attachments = Object.fromEntries(
      (result?.attachments ?? [])
        .filter((item) => item.body && item.contentType === "application/json")
        .map((item) => [item.name, JSON.parse(Buffer.from(item.body, "base64").toString())]),
    );
    rows.push({
      title: spec.title,
      project: test.projectName,
      status: result?.status,
      errors: (result?.errors ?? []).map((error) =>
        error.message
          // eslint-disable-next-line no-control-regex -- Playwright errors contain ANSI color escapes.
          .replace(/\x1b\[[0-9;]*m/g, "")
          .split("\n")
          .filter(Boolean)
          .slice(0, 3)
          .join(" "),
      ),
      observation: attachments.observation,
      axe: (attachments.axe ?? []).map((item) => ({
        id: item.id,
        impact: item.impact,
        nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
      })),
    });
  }
}
process.stdout.write(`${JSON.stringify({ stats: report.stats, rows }, null, 2)}\n`);
