#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { readFile, stat } from "node:fs/promises";
import {
  buildReport,
  capture,
  filterEvents,
  kinds,
  recordedCapture,
  recordedReport,
  runtimeHistory,
  mergeTimeline,
  type Kind,
} from "./index";

const help = `flop-upgrades [--json] [--kind spec|sdk|runtime|docs] [--search text]
  Default: replay bundled dated public recordings. No network requests.
  --live             Read the latest bounded public history window
  --from SHA --to SHA Compare two full yellowpaper commit SHAs (requires --live)
  --index PATH       Read a recorder index.json for observed runtime/SDK versions
  --diff             Include full before/after section text in terminal output
  --json             Emit the complete sourced report and selected events
  --help             Show this help
Dates use commit, publication, observed or page-labelled clocks. None prove deployment.`;

try {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      json: { type: "boolean" },
      live: { type: "boolean" },
      diff: { type: "boolean" },
      from: { type: "string" },
      to: { type: "string" },
      index: { type: "string" },
      kind: { type: "string" },
      search: { type: "string" },
    },
    allowPositionals: false,
  });
  if (values.help) console.log(help);
  else {
    if (values.kind && !kinds.includes(values.kind as Kind)) throw new Error("Unknown kind");
    if ((values.from || values.to) && !values.live) throw new Error("--from and --to require --live");
    const data = values.live ? await capture({ from: values.from, to: values.to }) : recordedCapture();
    let report = values.live ? buildReport(data) : recordedReport();
    if (values.index) {
      if ((await stat(values.index)).size > 4_000_000) throw new Error("Recorder index too large");
      const index: unknown = JSON.parse(await readFile(values.index, "utf8"));
      const result = runtimeHistory(index, {
        source: "https://github.com/zkasuran/flop-lab/tree/main/packages/recorder",
        measuredAt: new Date().toISOString(),
      });
      report = {
        ...report,
        events: mergeTimeline(
          report.events.filter((e) => !e.id.startsWith("recorder:")),
          result.events,
        ),
        gaps: [...report.gaps.filter((g) => g.kind !== "runtime"), ...result.gaps],
      };
    } else if (values.live)
      report.gaps.push({
        kind: "runtime",
        source: "https://github.com/zkasuran/flop-lab/tree/data",
        measuredAt: new Date().toISOString(),
        reason: "No recorder index supplied. Use --index PATH. Runtime history was not queried.",
      });
    const selected = filterEvents(report.events, values.kind as Kind | undefined, values.search);
    const output = {
      mode: values.live ? "live" : "recorded",
      requestsThisRun: values.live ? data.requests : 0,
      recordedRequests: data.requests,
      recordedDurationMs: data.durationMs,
      indexInput: values.index ?? (values.live ? null : "bundled index"),
      ...report,
      events: selected,
    };
    if (values.json) console.log(JSON.stringify(output, null, 2));
    else {
      console.log(`${output.mode}: ${selected.length} selected events. Requests this run: ${output.requestsThisRun}.`);
      for (const event of selected) {
        console.log(
          `\n${event.at} [${event.kind}; ${event.clock}] ${event.title}\n${event.detail}\nMeasured ${event.measuredAt}\n${event.source}`,
        );
        for (const change of event.changes) {
          if (change.name.startsWith("Parameter:") || values.diff)
            console.log(`${change.name}\n- ${change.before ?? "[absent]"}\n+ ${change.after ?? "[absent]"}`);
        }
      }
      for (const gap of report.gaps)
        console.log(`\nNo data [${gap.kind}]: ${gap.reason}\nMeasured ${gap.measuredAt}\n${gap.source}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Upgrades failed");
  process.exitCode = 1;
}
