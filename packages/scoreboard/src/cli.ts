#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Collector, parseSnapshot, rankSnapshot, pickMiner, sensitivity } from "./index";

const help = `flop-scoreboard snapshot|rank|explain <miner>|route [options]

--file <snapshot.json>       Offline mode. No requests.
--out <snapshot.json>        Save snapshot output.
--model <slug>               Required for route.
--max-price-per-gflop <FLOP>  Reject unknown live prices.
--min-confidence <0..1>      Default 0.2.
--exclude <miner>            Repeat to exclude miners.
--now <UTC timestamp>        Explicit evaluation time for replay.
--sensitivity               Rank changes for each weight +/-10%.
--json                      Machine-readable output.
--help                      Show this help.

Scores describe settlement history, not uptime or latency.
Gateway nominal listings do not provide per-GFLOP quotes.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      file: { type: "string" },
      out: { type: "string" },
      model: { type: "string" },
      "max-price-per-gflop": { type: "string" },
      "min-confidence": { type: "string" },
      exclude: { type: "string", multiple: true },
      now: { type: "string" },
      sensitivity: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  const command = positionals[0];
  if (!command || !["snapshot", "rank", "explain", "route"].includes(command)) throw new Error(help);
  if (positionals.length > (command === "explain" ? 2 : 1)) throw new Error("unexpected positional argument");
  if (command === "route" && !values.model) throw new Error("route requires --model");
  if (command === "explain" && !positionals[1]) throw new Error("explain requires a miner address");
  const requestedNow = values.now === undefined ? undefined : Date.parse(values.now);
  if (requestedNow !== undefined && !Number.isFinite(requestedNow)) throw new Error("invalid --now timestamp");
  const snapshot = values.file
    ? parseSnapshot(JSON.parse(await readFile(values.file, "utf8")))
    : await new Collector().snapshot();
  const now = requestedNow ?? Date.now();
  if (values.out && command !== "snapshot") throw new Error("--out only applies to snapshot");
  if (command === "snapshot") {
    const json = JSON.stringify(snapshot, null, 2) + "\n";
    if (values.out) await writeFile(values.out, json);
    if (values.json) console.log(json.trim());
    else
      console.log(
        `Snapshot ${snapshot.measuredAt}\n${snapshot.records.map((r) => `${r.kind}\t${r.source}\t${r.measuredAt}`).join("\n")}\nCollection requests: ${snapshot.collection.requests}; this invocation: ${values.file ? 0 : snapshot.collection.requests}${values.out ? `\nSaved ${values.out}` : "\nUse --json or --out to keep the snapshot."}`,
      );
    return;
  }
  const metadata = {
    measuredAt: snapshot.measuredAt,
    evaluatedAt: new Date(now).toISOString(),
    requests: values.file ? 0 : snapshot.collection.requests,
  };
  if (command === "route") {
    const result = pickMiner(snapshot, {
      model: values.model!,
      maxPricePerGflop: values["max-price-per-gflop"],
      minConfidence: values["min-confidence"] === undefined ? undefined : Number(values["min-confidence"]),
      exclude: values.exclude,
      now,
    });
    console.log(
      values.json
        ? JSON.stringify({ ...metadata, ...result }, null, 2)
        : `${JSON.stringify(metadata)}\n${result.status}\n${result.status === "picked" ? `${result.miner}\n${result.explanation.reasons.join("\n")}\n${result.explanation.warnings.join("\n")}` : `${result.reasons.join("\n")}\n${result.candidates.map((c) => `${c.miner}: ${c.reasons.join(", ")}`).join("\n")}`}`,
    );
    if (result.status === "no-eligible-miner") process.exitCode = 2;
    return;
  }
  const rows = rankSnapshot(snapshot, { now });
  const result = command === "explain" ? rows.find((row) => row.miner === positionals[1]) : rows;
  if (!result) throw new Error("miner not observed in snapshot");
  const movement = values.sensitivity ? sensitivity(snapshot, { now }) : undefined;
  if (values.json) console.log(JSON.stringify({ ...metadata, result, sensitivity: movement }, null, 2));
  else {
    const displayed = Array.isArray(result) ? result : [result];
    console.log(
      `Measured ${metadata.measuredAt}; evaluated ${metadata.evaluatedAt}\nMINER\tSCORE\tCONFIDENCE\tSETTLEMENTS\tLISTING`,
    );
    for (const r of displayed)
      console.log(
        `${r.miner}\t${r.score?.toFixed(2) ?? "no data"}\t${r.confidenceLabel} (${r.confidence.toFixed(3)})\t${r.settlements}\t${[...new Set(r.priceSources.map((p) => p.source))].join(", ") || "not listed"}`,
      );
    if (!Array.isArray(result)) {
      console.log("TERM\tWEIGHT\tOBSERVED VALUE\tCONTRIBUTION");
      for (const term of result.terms)
        console.log(
          `${term.name}\t${term.weight.toFixed(3)}\t${term.value.toFixed(3)}\t${term.contribution.toFixed(3)}`,
        );
      console.log(
        `Distinct agents: ${result.distinctAgents}\nUnused escrow ratio: ${result.unusedEscrowRatio ?? "no data"}\nHistorical lower-median price (raw units per GFLOP): ${result.historicalMedianPriceRaw ?? "no data"}`,
      );
    }
    for (const warning of new Set(displayed.flatMap((r) => r.warnings))) console.log(warning);
    for (const record of snapshot.records) console.log(`Source ${record.source} at ${record.measuredAt}`);
    if (movement) console.log(JSON.stringify(movement, null, 2));
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
