#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { runAudit } from "./runner";
try {
  const { values, positionals } = parseArgs({
    options: { json: { type: "boolean" }, tool: { type: "string" }, help: { type: "boolean" } },
    allowPositionals: true,
    strict: true,
  });
  if (values.help)
    console.log(
      "flop-mcpaudit run [--json] [--tool <name>]\nRead-only audit. At most 149 HTTP attempts, 500 ms spacing, no cached responses.\nExit 1: contract violation. Exit 2: incomplete audit. Exit 0: all selected checks pass.",
    );
  else {
    if (positionals.length !== 1 || positionals[0] !== "run")
      throw new Error("Usage: flop-mcpaudit run [--json] [--tool <name>]");
    const report = await runAudit({ ...(values.tool ? { tool: values.tool } : {}) });
    if (values.json) console.log(JSON.stringify(report));
    else {
      console.log(
        `${report.measuredAt} ${report.source}\n${report.requests} HTTP attempts; ${report.durationMs} ms elapsed`,
      );
      if (report.discoveryError) console.log(report.discoveryError);
      for (const tool of report.tools) {
        console.log(`${tool.status.padEnd(12)} ${tool.name}: ${tool.reason}`);
        for (const observation of tool.observations.filter((item) => item.status === "VIOLATION"))
          for (const finding of observation.findings)
            console.log(
              `  ${finding.schemaPath} ${finding.instancePath}: ${finding.message}${observation.confirmed ? " (reproduced)" : ""}`,
            );
      }
      for (const missing of report.trust.missing) console.log(`Trust: ${missing}`);
    }
    process.exitCode = report.tools.some((tool) => tool.status === "VIOLATION")
      ? 1
      : report.discoveryError || report.tools.some((tool) => tool.status !== "PASS")
        ? 2
        : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
