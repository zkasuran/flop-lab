#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { collectSessions, classifyCapture, channelId, states, recorderSample } from "./index";
import { loadCapture, saveCapture } from "./io";
import type { State } from "./lifecycle";
const help = `flop-sessions: dated compute channel lifecycle evidence

  flop-sessions list [--state X] [--replay DIR] [--json]
  flop-sessions show <channel> [--replay DIR] [--json]
  flop-sessions history <recorder-snapshot.json> [--json]

Options:
  --record DIR    Save original responses to a new local directory
  --max-pages N   Read at most N pages per channel/tape source (1 to 20)
  --replay DIR    Read a recording without network requests
  --state X      ${states.join(", ")}
  --json         Print full structured evidence
  --help         Show this help

Reads public devnet data only. Counts are observations, not chain proof.
`;
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean" },
      json: { type: "boolean" },
      state: { type: "string" },
      replay: { type: "string" },
      record: { type: "string" },
      "max-pages": { type: "string" },
    },
  });
  if (values.help) console.log(help);
  else {
    const command = positionals[0] ?? "list";
    if (!["list", "show", "history"].includes(command)) throw new Error("Unknown command. Use --help");
    if (values.state && (!states.includes(values.state as State) || command !== "list"))
      throw new Error("Invalid state filter");
    if (positionals.length > (command === "list" ? 1 : 2)) throw new Error("Unexpected argument");
    if (values.replay && (values.record || values["max-pages"]))
      throw new Error("Replay cannot record or set page limits");
    const id = command === "show" ? channelId(positionals[1]) : null;
    let report;
    if (command === "history") {
      if (!positionals[1] || values.replay || values.record || values["max-pages"])
        throw new Error("history needs one recorder snapshot path");
      if ((await stat(positionals[1])).size > 100_000) throw new Error("Snapshot exceeds size limit");
      report = await recorderSample(JSON.parse(await readFile(positionals[1], "utf8")) as unknown);
    } else {
      const capture = values.replay
        ? await loadCapture(values.replay)
        : await collectSessions({ maxPages: values["max-pages"] === undefined ? 20 : Number(values["max-pages"]) });
      if (values.record) await saveCapture(values.record, capture);
      report = classifyCapture(capture);
    }
    const sessions = report.sessions.filter(
      (s) => (!id || s.channelId === id) && (!values.state || s.state === values.state),
    );
    if (values.json) console.log(JSON.stringify({ ...report, sessions }, null, 2));
    else {
      console.log(`Observed ${report.measuredAt}\nSource ${report.source}`);
      console.log(
        `Channels ${report.channels.rows}/${report.channels.total ?? "unavailable"}; tape ${report.settlements.rows}/${report.settlements.total ?? "unavailable"}`,
      );
      for (const warning of report.warnings) console.log(warning);
      if (!sessions.length)
        console.log(id ? "Channel not found in this observation." : "No matching observed channels.");
      for (const s of sessions) {
        console.log(`${s.channelId}  ${s.state}`);
        if (command === "show") console.log(`${s.reason}\n${JSON.stringify(s.evidence, null, 2)}`);
      }
      if (command === "history") console.log(JSON.stringify(report.counts));
    }
    if (report.counts === null) process.exitCode = 3;
    else if (id && sessions.length === 0) process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Session inspection failed");
  process.exitCode = 1;
}
