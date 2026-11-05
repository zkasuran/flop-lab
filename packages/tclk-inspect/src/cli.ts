#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile, stat } from "node:fs/promises";
import { inspectTranscript, parseTranscript } from "./inspect";
import { createChainReader } from "./chain";
import { simulate, simulationPaths } from "./simulate";
const help = `flop-tclk inspect <transcript.json> [--json] [--offline]
flop-tclk simulate <path>

Inspect checks signed records. Unless --offline, it reads the public HTLC checker
and the first 100 indexer rows for an accepted hash statement. No transactions.
simulate writes synthetic signed records as JSON. No network requests.
Paths: ${simulationPaths.join(", ")}`;
const args = process.argv.slice(2);
try {
  if (args.length === 0 || args.includes("--help")) console.log(help);
  else if (args[0] === "simulate" && args.length === 2) console.log(JSON.stringify(simulate(args[1]!), null, 2));
  else if (args[0] === "inspect" && args[1] && args.slice(2).every((a) => ["--json", "--offline"].includes(a))) {
    const path = args[1];
    const info = await stat(path);
    if (!info.isFile() || info.size > 2_000_000) throw new Error("input must be a regular file within 2000000 bytes");
    const report = inspectTranscript(parseTranscript(await readFile(path, "utf8")), path);
    const chain = args.includes("--offline") ? null : await createChainReader()(report.state);
    if (args.includes("--json")) console.log(JSON.stringify({ ...report, chain }, null, 2));
    else {
      console.log(`TCLK ${report.verdict} | final transcript state: ${report.state?.status ?? "none"}`);
      console.log(`Inspected ${report.inspectedAt} | ${report.source}\nSPEC ${report.spec}`);
      for (const s of report.steps)
        console.log(
          `${s.ok ? "OK" : "BAD"} record ${s.index + 1}: ${s.type} ${s.from} -> ${s.to} | SPEC ${s.section}${s.reason ? ` | ${s.reason}` : ""}${s.warnings.length ? ` | ${s.warnings.join(" ")}` : ""}`,
        );
      if (report.firstViolation)
        console.log(
          `First violation: record ${report.firstViolation.index + 1}, SPEC ${report.firstViolation.section}: ${report.firstViolation.reason}`,
        );
      console.log(
        chain
          ? `Chain: ${chain.status}. ${chain.check}\n${chain.limit}\n${chain.evidence.map((e) => `${e.measuredAt} ${e.source}${e.error ? ` ${e.error}` : ""}`).join("\n")}`
          : "Chain: not queried (--offline).",
      );
      console.log(report.limits.join("\n"));
    }
    process.exitCode = report.verdict === "violation" ? 1 : 0;
  } else throw new Error(help);
} catch (error) {
  const message = error instanceof Error ? error.message : "inspection failed";
  if (args.includes("--json")) console.log(JSON.stringify({ error: message }));
  else console.error(message);
  process.exitCode = 2;
}
