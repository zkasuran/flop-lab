#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { catalogue } from "./catalogue";
import { createCollector } from "./collect";
import { loadPriceHistory } from "./history";

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      json: { type: "boolean" },
      input: { type: "string" },
      record: { type: "string" },
      history: { type: "boolean" },
      "fail-on-check": { type: "boolean" },
    },
    allowPositionals: false,
  });
  if (values.help) {
    console.log(
      "flop-models [--json] [--input recording.json] [--record recording.json] [--history] [--fail-on-check]\nRead-only model catalogue. Default: bounded live public reads.\n--input replays dated evidence offline. --record saves raw source text with its time.\n--history reads up to eight public recorder snapshots. Never converts price units.\n--fail-on-check exits 1 on FAIL or UNKNOWN. Invalid input exits 2.",
    );
    return;
  }
  const recording: unknown = values.input
    ? JSON.parse(await readFile(values.input, "utf8"))
    : await createCollector()();
  const report = catalogue(recording);
  if (values.record) await writeFile(values.record, JSON.stringify(report.recording, null, 2) + "\n", { flag: "wx" });
  const history = values.history ? await loadPriceHistory() : null;
  if (values.json) console.log(JSON.stringify({ ...report, history }, null, 2));
  else {
    console.log(
      `Model catalogue | ${values.input ? "recorded replay" : "public reads"}\n${report.recording.startedAt} to ${report.recording.completedAt}\nRecorded request count: ${report.recording.requests}; duration: ${report.recording.durationMs} ms`,
    );
    for (const check of report.checks) console.log(`${check.status} ${check.id}: ${check.reason}`);
    for (const model of report.models) {
      console.log(
        `\n${model.name} | gateway: ${model.gateway ? "listed" : "not listed or unavailable"}\nRegistry hash: ${model.registry?.hash ?? "unknown"}\nGateway model quote: prompt=${model.gateway?.prompt ?? "no data"} completion=${model.gateway?.completion ?? "no data"}; units absent from response\nMCP declared FLOP/GFLOP: ${model.pricing?.pricePerGflop ?? "no data"}`,
      );
      for (const check of model.checks) console.log(`  ${check.status} ${check.id}`);
      for (const source of model.gateway?.sources ?? [])
        console.log(
          `  ${source.address} | ${source.label} | ${source.effectiveAt} to ${source.expiresAt} | individual price: not supplied`,
        );
    }
    if (!report.models.length) console.log("No model data available.");
    for (const o of report.recording.observations)
      console.log(`${o.key} | ${o.source} | ${o.measuredAt}${o.error ? ` | ${o.error}` : ""}`);
    for (const error of report.errors) console.log(`UNKNOWN ${error.key}: ${error.reason}`);
    if (history) console.log(`History: ${JSON.stringify(history)}`);
  }
  if (
    values["fail-on-check"] &&
    [...report.checks, ...report.models.flatMap((m) => m.checks)].some((c) => c.status !== "PASS")
  )
    process.exitCode = 1;
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
