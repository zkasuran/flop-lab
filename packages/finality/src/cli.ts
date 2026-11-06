#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { analyzeRecording, collect, parseRecording } from "./index";
import recorded from "../test/fixtures/observation.json";

try {
  const { values, positionals } = parseArgs({
    options: {
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
      recorded: { type: "boolean" },
      input: { type: "string" },
      out: { type: "string" },
    },
    allowPositionals: true,
  });
  if (positionals.length > 1 || (positionals[0] && positionals[0] !== "snapshot"))
    throw new Error("Use snapshot or --help");
  if (values.help) {
    console.log(
      "flop-finality snapshot [--recorded | --input FILE] [--json] [--out FILE]\nRead public block production and reported finality. Default: one live MCP query.\n--out writes a new replayable recording without overwriting.\nExit: 0 normal, 1 warn/freeze/escape, 2 unavailable or invalid input.\nNo consensus proof or validator membership verification.",
    );
  } else {
    if (values.recorded && values.input) throw new Error("Choose recorded or input");
    let input: unknown;
    if (values.input) {
      if ((await stat(values.input)).size > 200_000) throw new Error("Recording exceeds 200 KB");
      input = JSON.parse(await readFile(values.input, "utf8"));
    }
    const recording = values.recorded
      ? parseRecording(recorded)
      : input !== undefined
        ? parseRecording(input)
        : await collect();
    const report = analyzeRecording(recording);
    if (values.out) await writeFile(values.out, JSON.stringify(recording, null, 2) + "\n", { flag: "wx" });
    if (values.json) console.log(JSON.stringify(report, null, 2));
    else
      console.log(
        [
          `${values.recorded || values.input ? "Recorded" : "Observed"} ${recording.measuredAt} from ${recording.source}`,
          `Production: ${report.production.intervals} linked intervals; median ${report.production.medianMs ?? "unavailable"} ms; ${report.production.excluded} excluded`,
          `Reported finality: ${report.lagState}; lag ${report.lag ?? "unavailable"} blocks; source state ${report.finality?.state ?? "unavailable"}`,
          `Pinned paper thresholds: warn >30; freeze >=120; escape >=3600 blocks. API thresholds match: ${report.thresholdsMatch ?? "unavailable"}`,
          "Validator set and rotation: unavailable in the inspected public schema. Indexed data is not a consensus proof.",
          `Requests: ${recording.requests}; duration: ${recording.durationMs} ms`,
        ].join("\n"),
      );
    process.exitCode =
      report.lagState === "unavailable" || report.production.intervals === 0 || report.thresholdsMatch === false
        ? 2
        : report.lagState === "normal"
          ? 0
          : 1;
  }
} catch (e) {
  console.error(`finality: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 2;
}
