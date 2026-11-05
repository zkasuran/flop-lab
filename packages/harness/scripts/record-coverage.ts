// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { runHarness } from "../src/runner";
import { compactReport } from "../src/report";
import { fetchClaimHistory } from "../src/history";
import { serialize } from "../src/validation";
const directory = new URL("../fixtures/coverage/", import.meta.url);
await mkdir(directory, { recursive: true });
async function save(name: string, value: unknown) {
  const data = serialize(value, 0);
  if (Buffer.byteLength(data) > 200_000) throw new Error(`Fixture exceeds byte ceiling: ${name}`);
  await writeFile(new URL(name, directory), data);
}
const report = await runHarness({ profile: "full", maxFlop: "0" });
for (const evidence of report.evidence) await save(`run-${evidence.id}.json`, evidence);
const compact = compactReport(report);
for (const evidence of compact.evidence) evidence.rawFixture = `fixtures/coverage/run-${evidence.id}.json`;
const resultFiles: string[] = [];
for (let i = 0; i < compact.results.length; i += 25) {
  const name = `results-${resultFiles.length}.json`;
  await save(name, compact.results.slice(i, i + 25));
  resultFiles.push(name);
}
await save("report.json", { ...compact, results: [], resultFiles });
await save("summary.json", {
  measuredAt: report.measuredAt,
  source: report.source,
  durationMs: report.durationMs,
  budget: report.budget,
  results: report.results.map((result) => ({
    id: result.claim.id,
    status: result.status,
    reason: result.reason,
    evidence: [...new Set(result.attempts.flatMap((attempt) => attempt.evidence))],
  })),
});
const history = await fetchClaimHistory(async (url, init) => {
  const response = await fetch(url, init);
  await save("history-response.json", {
    source: String(url),
    measuredAt: new Date().toISOString(),
    status: response.status,
    raw: await response.clone().text(),
  });
  return response;
});
await save("history.json", history);
console.log(
  serialize({
    measuredAt: report.measuredAt,
    durationMs: report.durationMs,
    budget: report.budget,
    counts: Object.fromEntries(
      ["PASS", "FAIL", "UNVERIFIABLE", "SKIPPED"].map((status) => [
        status,
        report.results.filter((result) => result.status === status).length,
      ]),
    ),
    failures: report.results
      .filter((result) => result.status === "FAIL")
      .map((result) => ({ id: result.claim.id, reason: result.reason })),
    history: history.state,
  }),
);
