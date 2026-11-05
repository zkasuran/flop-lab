#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { McpClient } from "@flop-lab/mcp";
import { analyze, formatFlop } from "./core";
import { collectTape } from "./watcher";
import { draftDossier } from "./dossier";
import { recordedClient } from "./recorded";

const help = `flop-challenger: read-only settlement review

  flop-challenger watch [--recorded] [--json] [--limit 20] [--sort priority]
  flop-challenger dossier <channel-id> [--recorded] [--json]

watch reads one bounded snapshot. It does not poll in the background.
--recorded replays dated public responses without network requests.
--limit controls displayed rows, not the ranking cohort. Default: 20.
--sort priority ranks human attention; default order is estimated urgency.
Explicit SettlementPosted rows get draft estimates. Cooperative payouts have no standard window.
Dossiers are dry run only. No key, bond or transaction is used.
`;

async function main(args: string[]): Promise<void> {
  if (args.length === 0 || (args.length === 1 && ["--help", "-h"].includes(args[0] ?? ""))) {
    console.log(help);
    return;
  }
  const command = args.shift();
  if (command !== "watch" && command !== "dossier") throw new Error("Expected watch or dossier. Use --help.");
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
  const tape = await collectTape(client, replay?.options);
  const report = analyze(tape, Date.now());
  if (command === "dossier" && id) {
    const dossier = await draftDossier(report, id, client);
    if (json) {
      console.log(JSON.stringify(dossier, null, 2));
      return;
    }
    console.log(
      `${dossier.mode}\n${dossier.channelId}\n${dossier.purpose}\nEstimated expiry: ${dossier.window.estimatedExpiry ?? "unknown"}\nDocumented bond: ${dossier.bond.documentedFlop} FLOP. Runtime value unverified.\n${dossier.bond.warning}\n${dossier.eligibility}\nExtrinsic: unavailable. ${dossier.submission.missing.join("; ")}`,
    );
    for (const assumption of dossier.assumptions) console.log(`Assumption: ${assumption}`);
    for (const check of dossier.checks) console.log(`[${check.status}] ${check.name}: ${check.detail}`);
    for (const call of dossier.submission.documentedCalls)
      console.log(`SDK reference only: ${call.signature}. ${call.lane} Missing: ${call.missingInputs.join("; ")}`);
    console.log(
      `Settlement source: ${dossier.evidence.settlement.source}\nMeasured: ${dossier.evidence.settlement.measuredAt}\nUse --json for the complete evidence bundle.`,
    );
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
