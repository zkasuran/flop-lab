#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parsePlan, datasets, formats } from "./schema";
import { createReader } from "./source";
import { exportDataset } from "./export";

const help = `flop-export <dataset> --out <directory> [options]
Datasets: ${datasets.join(", ")}
Formats: ${formats.join(", ")}
  --format csv|ndjson|parquet  Default: csv
  --offset N                 First row offset. Default: 0
  --rows N                   Maximum rows. Default: 100
  --page-size N              Rows per part, 1 to 100. Default: 100
  --max-requests N           HTTP attempts this invocation. Default: 10
  --addresses file           One account address per line
  --archive directory        Local recorder archive for snapshots
  --recorded                 Bundled dated sample, no network
  --resume                   Read saved query from --out; omit dataset and range options
  --help                     Show this help
Each part has a .manifest.json with source, query, dates, row count and SHA-256.
Exit 0: requested range ended. Exit 2: partial output. Exit 1: invalid input or integrity failure.
Ranges use mutable source row offsets. They are not atomic chain snapshots.`;
try {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean" },
      out: { type: "string" },
      format: { type: "string" },
      offset: { type: "string" },
      rows: { type: "string" },
      "page-size": { type: "string" },
      "max-requests": { type: "string" },
      addresses: { type: "string" },
      archive: { type: "string" },
      recorded: { type: "boolean" },
      resume: { type: "boolean" },
    },
  });
  if (v.help) console.log(help);
  else {
    if (!v.out || positionals.length > 1) throw new Error("Supply --out and one dataset. See --help.");
    if (
      v.resume &&
      (positionals.length ||
        [v.format, v.offset, v.rows, v["page-size"], v.addresses, v.archive, v.recorded].some((x) => x !== undefined))
    )
      throw new Error("Resume takes only --out, --resume and --max-requests");
    const plan = parsePlan(
      v.resume
        ? JSON.parse(await readFile(join(v.out, "export.json"), "utf8"))
        : {
            version: 1,
            dataset: positionals[0],
            format: v.format ?? "csv",
            offset: Number(v.offset ?? 0),
            rows: Number(v.rows ?? 100),
            pageSize: Number(v["page-size"] ?? 100),
            addresses: v.addresses
              ? (await readFile(v.addresses, "utf8"))
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
            archive: v.archive ? resolve(v.archive) : null,
            recorded: v.recorded ?? false,
          },
    );
    const budget = Number(v["max-requests"] ?? 10);
    if (!Number.isSafeInteger(budget) || budget < 0 || budget > 10_000) throw new Error("Invalid request budget");
    const reader = plan.recorded
      ? await (await import("./recorded")).recordedReader(plan.dataset)
      : createReader(plan, budget);
    const report = await exportDataset({ directory: v.out, plan, reader, resume: v.resume });
    console.log(JSON.stringify(report, null, 2));
    if (report.status === "partial") process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
