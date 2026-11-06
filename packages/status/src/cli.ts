#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { appendRun } from "./archive";
import { analyzeHistory } from "./history";
import { probeServices } from "./probe";
import { parseHistory } from "./schema";

const help = `flop-status [probe|history] [options]
  probe                 One read-only request per public service (default)
  --json                Machine-readable JSON
  --timeout-ms <ms>     Total per-service deadline, 1 to 30000 (default 10000)
  --observer <label>    Capture origin (default local)
  --archive <directory> Append capture under status/YYYY/MM/DD.jsonl
  history --file <path> Analyze recorded JSONL without network requests
  --from <ISO> --to <ISO> Inclusive observation window (default capture bounds)
  --help                Show this help

Exit 0: probe passes or history is valid. Exit 1: a measured probe fails.
Exit 2: invalid input or archive failure. Failures are archived before exit 1.
Availability is passed probes / measured probes, not continuous uptime.
No automatic retry. Repeated probes should be spaced by at least 5 minutes.
`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean" },
      json: { type: "boolean" },
      "timeout-ms": { type: "string" },
      observer: { type: "string" },
      archive: { type: "string" },
      file: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
    },
  });
  if (values.help) console.log(help);
  else if (positionals.length > 1) throw new Error("Expected one command");
  else if (!positionals[0] || positionals[0] === "probe") {
    if (values.file || values.from || values.to) throw new Error("History flags require the history command");
    const run = await probeServices({
      timeoutMs: values["timeout-ms"] === undefined ? undefined : Number(values["timeout-ms"]),
      observer: values.observer,
    });
    if (values.archive) await appendRun(values.archive, run);
    if (values.json) console.log(JSON.stringify(run));
    else {
      console.log(`Observer ${run.observer}; ${run.requests} requests; ${run.startedAt} to ${run.finishedAt}`);
      for (const p of run.probes)
        console.log(
          `${p.service.padEnd(10)} ${p.outcome.padEnd(14)} HTTP ${p.httpStatus ?? "none"} ${p.latencyMs} ms\n  ${p.measuredAt} ${p.source}\n  ${p.detail}`,
        );
    }
    process.exitCode = run.probes.every((p) => p.outcome === "pass") ? 0 : 1;
  } else if (positionals[0] === "history") {
    if (!values.file || values.archive || values.observer || values["timeout-ms"])
      throw new Error("history requires --file and accepts --from, --to and --json");
    const runs = parseHistory(await readFile(values.file, "utf8"));
    const dates = runs.flatMap((run) => run.probes.map((p) => p.measuredAt)).sort();
    const window = {
      from: values.from ?? dates[0] ?? new Date(0).toISOString(),
      to: values.to ?? dates.at(-1) ?? new Date(0).toISOString(),
    };
    const services = analyzeHistory(runs, window);
    if (values.json) console.log(JSON.stringify({ window, services }));
    else {
      console.log(`Measured probe availability; window ${window.from} to ${window.to}`);
      for (const s of services)
        console.log(
          `${s.name}: ${s.availability === null ? "No data" : `${(s.availability * 100).toFixed(1)}% (${s.passed}/${s.samples} samples)`}; ${s.incidents.length} failed-sample spans\n  ${s.url}`,
        );
    }
  } else throw new Error("Unknown command. Use --help");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
