// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { definitions, parseResult, revalidateSeconds, schemaVersion, type Endpoint, type Source } from "../src/schema";
import tape from "../../verifier/fixtures/settlements-0.json";
import { checkArithmetic } from "../../verifier/src/checks/index";
import { settlementPage } from "../../watch/src/observations";
import { readRecording as harnessRecording } from "../../../apps/web/app/harness/data";
import { readRecording as contractRecording } from "../../../apps/web/app/contracts/data";
import { recordedReport } from "../../spec/src/recorded";
import modelRecording from "../../models/test/fixtures/devnet.json";
import { catalogue } from "../../models/src/catalogue";
import { recordedReplay, initialConfig } from "../../../apps/web/app/watch/data";

// Pin links to the main revision whose recordings were reviewed. Updating code does not move evidence URLs.
const revision = "b421a4a";
const link = (path: string) => `https://github.com/zkasuran/flop-lab/blob/${revision}/${path}`;
function summary(
  tool: Endpoint,
  metrics: Record<string, number>,
  states: string[],
  sources: Source[],
  recordings: string[],
  limitations: string[],
) {
  const unique = [...new Map(sources.map((source) => [JSON.stringify(source), source])).values()];
  const outcomes = Object.fromEntries(
    definitions[tool].outcomes.map((status) => [status, states.filter((value) => value === status).length]),
  );
  return parseResult(tool, {
    schemaVersion,
    tool,
    mode: "recorded",
    measuredAt: new Date(Math.max(...unique.map((source) => Date.parse(source.measuredAt)))).toISOString(),
    sources: unique,
    recordings: recordings.map(link),
    revalidateSeconds,
    summary: { metrics, outcomes },
    limitations,
  });
}
const rows = settlementPage(tape.raw).rows;
const tapeChecks = rows.flatMap((row) => checkArithmetic(row));
const harness = harnessRecording();
const contracts = contractRecording();
if (!harness || !contracts) throw new Error("Bundled reports failed their suite validators");
const spec = recordedReport();
const models = catalogue(modelRecording);
const modelChecks = [...models.checks, ...models.models.flatMap((model) => model.checks)];
const watch = recordedReplay(initialConfig);
const results = {
  verifier: summary(
    "verifier",
    { channels: rows.length, checks: tapeChecks.length },
    tapeChecks.map((check) => check.status),
    [{ url: tape.source, measuredAt: tape.measuredAt }],
    ["packages/verifier/fixtures/settlements-0.json"],
    [
      "Only the first recorded settlement page is summarized. This is a bounded tape sample.",
      "Escrow and displayed-price arithmetic do not verify inference, agreed pricing or movement of funds.",
    ],
  ),
  harness: summary(
    "harness",
    {
      claims: harness.results.length,
      requests: harness.budget.requests,
      flaky: harness.results.filter((result) => result.flaky).length,
    },
    harness.results.map((result) => result.status),
    harness.evidence.map((evidence) => ({ url: evidence.request.url, measuredAt: evidence.measuredAt })),
    ["packages/harness/fixtures/coverage/report.json"],
    [
      "Last bundled coverage run, not the latest run on a user's machine. The manifest links its raw evidence parts.",
      "Skipped and unverifiable claims are not passes. These observations do not establish current health.",
    ],
  ),
  spec: summary(
    "spec",
    { comparisons: spec.differences.length, transactions: spec.transactionCount },
    spec.differences.map((diff) => diff.result),
    spec.differences.flatMap((diff) =>
      [diff.spec?.evidence, diff.runtime?.evidence]
        .filter((e) => e !== undefined && e !== null)
        .map((e) => ({ url: e.source, measuredAt: e.measuredAt })),
    ),
    ["packages/spec/fixtures/knowledge.json", "packages/spec/fixtures/paper-0.json"],
    ["Catalog agreement does not verify deployed runtime storage or consensus.", ...spec.warnings],
  ),
  contracts: summary(
    "contracts",
    { tools: contracts.tools.length, requests: contracts.requests },
    contracts.tools.map((tool) => tool.status),
    contracts.tools.flatMap((tool) =>
      tool.observations
        .filter((o) => o.measuredAt !== null)
        .map((o) => ({ url: contracts.source, measuredAt: o.measuredAt! })),
    ),
    ["packages/mcpaudit/last-run.json"],
    [
      "Counts summarize tool outcomes in the bundled contract audit. Simulated service output is not proof.",
      "Schema agreement does not establish inference correctness or current service availability.",
    ],
  ),
  models: summary(
    "models",
    { models: models.models.length, checks: modelChecks.length, errors: models.errors.length },
    modelChecks.map((check) => check.status),
    models.recording.observations.map((o) => ({ url: o.source, measuredAt: o.measuredAt })),
    ["packages/models/test/fixtures/devnet.json"],
    [
      "Checks include catalogue-wide and per-model checks. Quote freshness is evaluated at the recorded gateway read time.",
      "Registry membership does not verify model weights ran. Gateway-backed discovery is not independent corroboration.",
    ],
  ),
  status: parseResult("status", {
    schemaVersion,
    tool: "status",
    mode: "unavailable",
    measuredAt: null,
    sources: [],
    recordings: [],
    revalidateSeconds,
    summary: null,
    limitations: [
      "The status package has not landed on the reviewed main revision. No availability count is reported.",
    ],
  }),
  watch: summary(
    "watch",
    {
      polls: watch.polls.length,
      alerts: watch.polls.reduce((sum, poll) => sum + poll.alerts.length, 0),
      requests: watch.requests,
    },
    [],
    watch.polls.flatMap((poll) => poll.observations.map((o) => ({ url: o.source, measuredAt: o.measuredAt }))),
    [
      "packages/watch/test/fixtures/2026-11-06T04-45-55.439Z.json",
      "packages/watch/test/fixtures/2026-11-06T04-49-00.280Z.json",
    ],
    [
      "Default rules replayed over bundled polls. Zero alerts do not establish continuous uptime.",
      "Bounded pages and missing local harness observations cannot reconstruct events between polls.",
    ],
  ),
};
const destination = new URL("../src/results.json", import.meta.url);
if (process.argv.includes("--check")) assert.deepEqual(JSON.parse(await readFile(destination, "utf8")), results);
else await writeFile(destination, JSON.stringify(results, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      revision,
      requests: 0,
      summaries: Object.fromEntries(Object.entries(results).map(([key, value]) => [key, value.summary])),
    },
    null,
    2,
  ),
);
