#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile, stat, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  createCollector,
  analyzeRecording,
  recordedInput,
  recordedHistory,
  proofHistory,
  proofReference,
} from "./index";

const help = `flop-proofs [list|coverage|types|history] [options]
  --json                 Machine-readable result with source times
  --live                 Read public MCP data (list or coverage)
  --limit N              Maximum proof and settlement rows, 1..1000 (default 100)
  --input FILE           Replay a saved recording (list or coverage)
  --save FILE            Save raw captures for replay (list or coverage)
  --index FILE           Read a recorder index (history)
  --channel 0x...         Select a recorded settlement (coverage)
  --help                 Show this help without network requests

Default: bundled dated recordings. UNVERIFIABLE is not a failed proof.
Live cache TTL: 60000 ms per collector. At most 23 tool calls at limit 1000,
each with one retry on 429, 5xx or transport failure. No wallets or writes to FLOP.
`;
async function load(path: string) {
  if ((await stat(path)).size > 4_000_000) throw new Error("Input exceeds 4 MB");
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
try {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      help: { type: "boolean" },
      json: { type: "boolean" },
      live: { type: "boolean" },
      limit: { type: "string" },
      input: { type: "string" },
      save: { type: "string" },
      index: { type: "string" },
      channel: { type: "string" },
    },
  });
  const command = positionals[0] ?? "list";
  if (values.help) {
    console.log(help);
  } else {
    if (positionals.length > 1 || !["list", "coverage", "types", "history"].includes(command))
      throw new Error("Unknown command. Use --help.");
    if (values.live && values.input) throw new Error("Choose --live or --input");
    if (values.limit && !values.live) throw new Error("--limit requires --live");
    if (values.index && command !== "history") throw new Error("--index requires history");
    if (values.channel && command !== "coverage") throw new Error("--channel requires coverage");
    if (["types", "history"].includes(command) && (values.live || values.input || values.save))
      throw new Error("Data options require list or coverage");
    if (command === "types") {
      const ref = proofReference();
      console.log(
        values.json
          ? JSON.stringify(ref, null, 2)
          : [
              `Specification ${ref.sha}, fetched ${ref.measuredAt}`,
              ref.source,
              ...ref.types.map(
                (t) =>
                  `${t.name} (${t.requirement})\n${t.establishes}\n${t.evidence.quote}\n${t.evidence.source}\nLimit: ${t.limit}`,
              ),
              ...ref.parameters.map((p) => `${p.name}: ${p.value} (SPECIFICATION_ONLY)\n${p.source}`),
              `Rail boundary: ${ref.rail.quote}\n${ref.rail.source}`,
              ...ref.calls.map((c) => `${c.quote}\n${c.source}`),
            ].join("\n\n"),
      );
    } else if (command === "history") {
      const history = values.index ? proofHistory(await load(values.index)) : recordedHistory();
      console.log(
        values.json
          ? JSON.stringify(history, null, 2)
          : [
              "Recorder history: rolling proofs24h and sampled leaderboard rows. Never sum these windows.",
              ...history.map(
                (p) =>
                  `${p.measuredAt}\nproofs24h=${p.proofs24h.value ?? "no data"} at ${p.proofs24h.measuredAt}\n${p.proofs24h.source}\nleaderboard rows=${p.leaderboardRows.value ?? "no data"} at ${p.leaderboardRows.measuredAt}\n${p.leaderboardRows.source}`,
              ),
              ...(history.length ? [] : ["No recorder runs."]),
            ].join("\n"),
      );
    } else {
      const input = values.live
        ? await createCollector()(values.limit === undefined ? 100 : Number(values.limit))
        : values.input
          ? await load(values.input)
          : recordedInput();
      const report = analyzeRecording(input);
      report.mode = values.live ? "live" : "recorded";
      if (values.save) await writeFile(values.save, JSON.stringify(report.recording, null, 2) + "\n", { flag: "wx" });
      if (values.channel && !/^0x[\da-f]{64}$/i.test(values.channel)) throw new Error("Invalid channel hash");
      const coverage = values.channel
        ? report.coverage.filter((c) => c.channelId.toLowerCase() === values.channel!.toLowerCase())
        : report.coverage;
      if (values.json)
        console.log(
          JSON.stringify(
            command === "coverage"
              ? {
                  measuredAt: report.recording.finishedAt,
                  source: report.settlements.source,
                  proofSource: report.proofs,
                  settlements: report.settlements,
                  coverage,
                  limits: report.limits,
                }
              : report,
            null,
            2,
          ),
        );
      else {
        console.log(
          `${report.mode} observation ${report.recording.startedAt} to ${report.recording.finishedAt}\n${report.proofs.source}\nRecorded request count: ${report.recording.requests}; capture duration: ${report.recording.durationMs} ms`,
        );
        console.log(
          `Proof rows: ${report.proofs.value?.rows.length ?? "no data"}; proofs24h: ${report.stats.value?.proofs24h ?? "no data"}; leaderboard rows: ${report.leaderboard.value?.length ?? "no data"}`,
        );
        console.log(
          `Settlement rows: ${report.settlements.value?.rows.length ?? "no data"}; reported total: ${report.settlements.value?.reportedTotal ?? "no data"}; sample ${report.settlements.value?.complete ? "complete by reported pagination" : "partial or unavailable"}`,
        );
        if (command === "coverage")
          console.log(
            coverage.length
              ? coverage.map((c) => `${c.channelId} ${c.status}\n${c.reason}`).join("\n")
              : "No matching settlement data.",
          );
        else {
          for (const proof of report.proofs.value?.rows ?? []) console.log(JSON.stringify(proof));
          for (const leader of report.leaderboard.value ?? []) console.log(JSON.stringify(leader));
        }
        for (const evidence of [
          report.proofs,
          report.settlements,
          report.stats,
          report.leaderboard,
          report.indexerLeaderboard,
        ])
          console.log(`${evidence.source} at ${evidence.measuredAt}${evidence.reason ? `: ${evidence.reason}` : ""}`);
        console.log(report.limits);
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
