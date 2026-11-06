#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { McpClient } from "../../mcp/src/index";
import { analyze, formatFlop } from "./core";
import { collectTape } from "./watcher";
import { draftDossier } from "./dossier";
import { recordedClient } from "./recorded";
import { readFile } from "node:fs/promises";
import { analyzeWindows, collectWindows } from "./windows";
import { recordedWindows, recordedEvidence } from "./recorded-evidence";
import { dossierMarkdown, replayDossier, MAX_DOSSIER_BYTES } from "./export";

const help = `flop-challenger: read-only settlement review

  flop-challenger watch [--recorded] [--json] [--limit 20] [--sort priority]
  flop-challenger dossier <channel-id> [--recorded] [--json]
  flop-challenger windows [--recorded] [--json]
  flop-challenger replay <dossier.json>

watch reads one bounded snapshot. It does not poll in the background.
--recorded replays dated public responses without network requests.
--limit controls displayed rows, not the ranking cohort. Default: 20.
--sort priority ranks human attention; default order is estimated urgency.
windows compares indexed challengeEnd with the reported finalized head.
Dossier text output is Markdown with the full hashed JSON attachment.
Dossiers are dry run only. No key, bond or transaction is used.
`;

async function main(args: string[]): Promise<void> {
  if (args.length === 0 || (args.length === 1 && ["--help", "-h"].includes(args[0] ?? ""))) {
    console.log(help);
    return;
  }
  const command = args.shift();
  if (command === "replay") {
    if (args.length !== 1 || args[0]!.startsWith("--")) throw new Error("replay requires one dossier JSON file");
    const file = await readFile(args[0]!);
    if (file.byteLength > MAX_DOSSIER_BYTES) throw new Error("Dossier exceeds 2 MB");
    const result = await replayDossier(JSON.parse(file.toString("utf8")) as unknown);
    console.log(JSON.stringify({ ...result, networkRequests: 0 }, null, 2));
    process.exitCode = result.verifier.exitCode;
    return;
  }
  if (command !== "watch" && command !== "dossier" && command !== "windows")
    throw new Error("Expected watch, windows, dossier or replay. Use --help.");
  const id = command === "dossier" ? args.shift() : undefined;
  if (command === "dossier" && (!id || id.startsWith("--"))) throw new Error("dossier requires an exact channel ID");
  let recorded = false;
  let json = false;
  let limit = 20;
  let priority = false;
  const seen = new Set<string>();
  while (args.length) {
    const flag = args.shift() ?? "";
    if (seen.has(flag)) throw new Error(`Duplicate flag: ${flag}`);
    seen.add(flag);
    if (flag === "--recorded") recorded = true;
    else if (flag === "--json") json = true;
    else if (flag === "--limit" && command === "watch") {
      const value = args.shift() ?? "";
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1000)
        throw new Error("--limit must be an integer from 1 to 1000");
      limit = Number(value);
    } else if (flag === "--sort" && command === "watch" && args.shift() === "priority") priority = true;
    else throw new Error(`Unknown or invalid flag: ${flag}`);
  }
  const replay = recorded ? recordedClient() : null;
  const client = replay?.client ?? new McpClient({ retries: 1 });
  if (command === "windows") {
    const windows = analyzeWindows(recorded ? recordedWindows : await collectWindows(client));
    if (json) console.log(JSON.stringify(windows, null, 2));
    else {
      console.log(
        `Forced claims | ${recorded ? "recorded" : "live"} | ${windows.capturedAt}\nReported finalized head: ${windows.head?.number ?? "unknown"}\nCadence: ${windows.cadence?.milliseconds ?? "unknown"} ms per block\nCoverage: ${windows.rows.length}/${windows.total ?? "unknown"}; ${windows.complete ? "all reported forced claims" : "partial"}`,
      );
      for (const row of windows.rows)
        console.log(
          `${row.channelId}\n  ${row.status} | end ${row.endBlock ?? "unknown"} | remaining ${row.remainingBlocks ?? "unknown"} blocks | estimated ${row.estimatedRemainingMs ?? "unavailable"} ms\n  ${row.reason}`,
        );
      for (const warning of windows.warnings) console.log(`Note: ${warning}`);
      console.log(`Requests: ${recorded ? "0 network requests (recorded replay)" : windows.requests}`);
    }
    return;
  }
  const tape = await collectTape(client, replay?.options);
  const report = analyze(tape, Date.now());
  if (command === "dossier" && id) {
    const dossier = await draftDossier(report, id, client, undefined, {
      ...(recorded ? { bundle: await recordedEvidence(id) } : {}),
      windows: recorded ? recordedWindows : await collectWindows(client),
    });
    if (json) {
      console.log(JSON.stringify(dossier, null, 2));
      return;
    }
    console.log(dossierMarkdown(dossier));
    return;
  }
  const rows = priority
    ? [...report.rows].sort(
        (a, b) => b.priority.score - a.priority.score || a.settlement.channelId.localeCompare(b.settlement.channelId),
      )
    : report.rows;
  if (json) {
    console.log(
      JSON.stringify(
        { ...report, rows: rows.slice(0, limit), displayed: Math.min(limit, rows.length), rankingCohort: rows.length },
        null,
        2,
      ),
    );
    return;
  }
  console.log(
    `FLOP challenger | ${tape.mode} | read only\nSource: ${tape.source}\nMeasured: ${tape.startedAt} to ${tape.measuredAt}\nEvaluated: ${report.evaluatedAt}\nTape: ${tape.settlements.length}/${tape.coverage.reportedTotal} rows; ${tape.coverage.complete ? "all reported rows retrieved" : "partial"}\nRequests: ${tape.requests} ${recorded ? "fixture replays; network requests: 0" : "HTTP attempts"}`,
  );
  for (const assumption of report.assumptions) console.log(`Assumption: ${assumption}`);
  console.log(
    report.blockCadence
      ? `Observed block cadence: ${report.blockCadence.milliseconds} ms across ${report.blockCadence.intervals} intervals. Source: flop_get_block.`
      : "Observed block cadence: unavailable.",
  );
  for (const warning of [...tape.warnings, ...tape.coverage.notes]) console.log(`Note: ${warning}`);
  if (!rows.length) {
    console.log("No settlement data returned. No review ranking available.");
    return;
  }
  for (const row of rows.slice(0, limit)) {
    console.log(
      `\n${row.settlement.channelId}\n  ${row.window.status} | estimated expiry ${row.window.estimatedExpiry ?? "not established"} | remaining ${row.window.remainingMs === null ? "not established" : `${Math.floor(row.window.remainingMs / 1000)} s`}\n  ${row.window.reason}\n  review ${row.priority.score}/100 | field coverage ${row.priority.confidence.availableSignals}/${row.priority.confidence.totalSignals} | paid ${formatFlop(row.settlement.minerPaid)} FLOP\n  observed ${row.measuredAt} from ${row.source}`,
    );
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`flop-challenger: ${error instanceof Error ? error.message : "Request failed"}`);
  process.exitCode = 1;
});
