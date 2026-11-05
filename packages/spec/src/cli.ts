#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { compare } from "./compare";
import { createRuntimeReader } from "./live";
import { recordedReport, recordedSpec } from "./recorded";

const help = `flop-spec diff [--json] [--section A|G|H] [--live]
flop-spec params [--json] [--live]
flop-spec calls [--json] [--live]

Default: replay bundled dated public observations against the pinned yellowpaper.
--live reads the public MCP with a bounded sample. The yellowpaper pin stays fixed.
Exit 1: DRIFT in the selected rows. Exit 2: invalid arguments or incomplete live collection.
MATCH against the catalog does not verify runtime storage. No transaction is submitted.`;

try {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.length === 0) console.log(help);
  else {
    const command = args.shift();
    if (!["diff", "params", "calls"].includes(command ?? "")) throw new Error("Unknown command");
    let section = command === "params" ? "A" : command === "calls" ? "G" : undefined;
    let json = false;
    let live = false;
    while (args.length) {
      const arg = args.shift();
      if (arg === "--json") json = true;
      else if (arg === "--live") live = true;
      else if (arg === "--section" && command === "diff") {
        section = args.shift();
        if (!["A", "G", "H"].includes(section ?? "")) throw new Error("Section must be A, G or H");
      } else throw new Error(`Unknown option: ${arg}`);
    }
    let report = recordedReport();
    let incomplete = false;
    if (live) {
      const observed = await createRuntimeReader()();
      incomplete =
        !observed.runtime.catalogAvailable ||
        !observed.runtime.stats ||
        !observed.records.transactions ||
        observed.runtime.warnings.some((w) => /^(catalog|stats|transactions|transaction|indexer|schema):/.test(w));
      report = compare(recordedSpec(), observed.runtime, { mode: "live", at: new Date().toISOString() });
    }
    const rows = report.differences.filter((d) => !section || d.appendix === section);
    report = {
      ...report,
      differences: rows,
      counts: { MATCH: 0, DRIFT: 0, SPEC_ONLY: 0, RUNTIME_ONLY: 0, UNOBSERVABLE: 0 },
    };
    for (const row of rows) report.counts[row.result]++;
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(
        `Yellowpaper ${report.sha}\nLast compared ${report.lastCompared} (${report.mode})\nCatalog agreement is not runtime verification.\n`,
      );
      for (const d of rows)
        console.log(
          `${d.result.padEnd(13)} ${d.id}${d.result === "DRIFT" ? `: ${d.spec?.value} ${d.spec?.unit} -> ${d.runtime?.value} ${d.runtime?.unit}` : ""}`,
        );
      console.log(`\n${JSON.stringify(report.counts)}`);
      for (const warning of report.warnings) console.log(`Note: ${warning}`);
    }
    process.exitCode = report.counts.DRIFT ? 1 : incomplete ? 2 : 0;
  }
} catch (error) {
  console.error(`flop-spec: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
