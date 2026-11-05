#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { auditSnapshot, createAuditor, formatReport } from "./index";

const help = `flop-indexer-audit run [--json] [--limit N] [--snapshot FILE]

Audit public FLOP indexer consistency. Read-only.
--limit N         Rows per list and maximum channel lookups, 1 to 100 (default 20).
--json            Full report, raw observations, source URLs and dates.
--snapshot FILE   Evaluate a saved snapshot or JSON report offline (maximum 20 MB).
--help            Show this help.

Exit codes: 0 no FAIL, 1 at least one FAIL, 2 invalid input or no usable response.
UNVERIFIABLE is not PASS. MCP and explorer can share a backend.
`;
try {
  const { values, positionals } = parseArgs({
    options: {
      json: { type: "boolean" },
      limit: { type: "string" },
      snapshot: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: true,
  });
  if (values.help) console.log(help);
  else {
    if (positionals.length !== 1 || positionals[0] !== "run") throw new Error("Expected run. Use --help for usage.");
    if (values.limit !== undefined && !/^(?:[1-9]\d?|100)$/.test(values.limit))
      throw new Error("--limit must be an integer from 1 to 100");
    if (values.snapshot && values.limit !== undefined) throw new Error("--limit cannot change a recorded snapshot");
    let report;
    if (values.snapshot) {
      if ((await stat(values.snapshot)).size > 20_000_000) throw new Error("Snapshot exceeds 20 MB");
      const input: unknown = JSON.parse(await readFile(values.snapshot, "utf8"));
      report = auditSnapshot(input && typeof input === "object" && "snapshot" in input ? input.snapshot : input);
    } else report = await createAuditor().run({ limit: values.limit === undefined ? 20 : Number(values.limit) });
    console.log(values.json ? JSON.stringify(report, null, 2) : formatReport(report));
    process.exitCode = report.counts.FAIL ? 1 : report.counts.PASS ? 0 : 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
