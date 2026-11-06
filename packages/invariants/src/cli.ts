#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { coverageFor, recordedCatalogue, recordedInputs, runChecks, type Inputs } from "./index";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { help: { type: "boolean", short: "h" }, json: { type: "boolean" }, input: { type: "string" } },
  });
  const command = positionals[0] ?? "run";
  if (values.help) {
    console.log(
      "flop-invariants [run|catalogue] [--json] [--input file]\n\nRe-evaluate dated raw observations with the existing suite libraries.\nNo network requests. --input accepts native verifier, indexer, harness and spec inputs.\nExit: 0 report generated; 1 scoped mismatch; 2 invalid arguments or input.\nAn exit of 0 does not mean the protocol invariants are verified.",
    );
  } else {
    if (positionals.length > 1 || !["run", "catalogue"].includes(command))
      throw new Error("Use run or catalogue. See --help.");
    if (command === "catalogue") {
      if (values.input) throw new Error("--input applies only to run");
      const rows = recordedCatalogue().map((row) => ({ ...row, ...coverageFor(row) }));
      console.log(
        values.json
          ? JSON.stringify(rows, null, 2)
          : rows
              .map(
                (r) => `${r.id} | ${r.title}\n${r.checks.join(", ") || "Not observable from outside"}\n${r.boundary}`,
              )
              .join("\n\n")
              .replace(/[\u2013\u2014]/g, "-"),
      );
    } else {
      let input: Inputs = recordedInputs();
      if (values.input) {
        if ((await stat(values.input)).size > 2_000_000) throw new Error("Input exceeds 2000000 bytes");
        input = JSON.parse(await readFile(values.input, "utf8")) as Inputs;
      }
      const report = await runChecks(input);
      console.log(
        values.json
          ? JSON.stringify(report, null, 2)
          : [
              "FLOP security invariants | recorded evidence replay",
              ...report.sources.map((s) => `Paper: ${s.url} | captured ${s.measuredAt}`),
              ...report.entries.map((r) => `${r.id.padEnd(10)} ${r.signal.padEnd(13)} ${r.title}`),
              "",
              ...report.warnings,
              `Counts: ${JSON.stringify(report.counts)}`,
            ]
              .join("\n")
              .replace(/[\u2013\u2014]/g, "-"),
      );
      process.exitCode = report.counts.MISMATCH ? 1 : 0;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
