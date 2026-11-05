#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile, stat, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { EvidenceFetcher, MAX_BUNDLE_BYTES, verifyEvidence } from "./index";

const HELP = `flop-verify channel <0x-channel-id> [--json] [--out evidence.json]
flop-verify bundle <evidence.json> [--json]
flop-verify tape [--limit 20] [--json]

channel saves raw public evidence with --out. bundle performs no network requests.
tape checks only escrow and the displayed price ratio, not inference or agreed pricing.
Exit: 0 all checks PASS/NOT_APPLICABLE; 1 any FAIL; 3 UNVERIFIABLE without FAIL.
Usage and unreadable input errors exit 1.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean" },
      out: { type: "string" },
      limit: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const [command, input, ...extra] = positionals;
  if (extra.length || !["channel", "bundle", "tape"].includes(command ?? "")) throw new Error(HELP);
  if (values.limit !== undefined && command !== "tape") throw new Error("--limit is for tape only");
  if (values.out !== undefined && command !== "channel") throw new Error("--out is for channel only");
  const fetcher = new EvidenceFetcher();
  if (command === "tape") {
    if (input) throw new Error("tape takes no positional argument");
    if (values.limit !== undefined && !/^[1-9]\d{0,3}$/.test(values.limit))
      throw new Error("--limit must be a positive integer");
    const report = await fetcher.tape(values.limit ? Number(values.limit) : 20);
    if (values.json) console.log(JSON.stringify({ ...report, requests: fetcher.stats }, null, 2));
    else {
      console.log(
        `Tape arithmetic: ${report.rows.length} rows at ${report.capturedAt}\nSource: ${report.source}\nHTTP requests: ${fetcher.stats.requests}`,
      );
      for (const status of ["PASS", "FAIL", "UNVERIFIABLE", "NOT_APPLICABLE"] as const)
        console.log(
          `${status}: ${report.rows.flatMap((r) => r.checks).filter((c) => c.status === status).length} checks`,
        );
      for (const row of report.rows)
        for (const check of row.checks.filter((c) => c.status !== "PASS"))
          console.log(`${row.channelId} ${check.status} ${check.id}: ${check.detail}`);
      if (report.rows.length === 0) console.log("UNVERIFIABLE: no settlement rows");
      for (const error of report.errors) console.log(`UNVERIFIABLE: ${error}`);
      console.log(
        "Only escrow and displayed-price arithmetic were checked. Inference and agreed pricing were not verified.",
      );
    }
    process.exitCode = report.exitCode;
    return;
  }
  if (!input) throw new Error(`${command} requires an argument`);
  let bundle: unknown;
  if (command === "bundle") {
    if ((await stat(input)).size > MAX_BUNDLE_BYTES) throw new Error("Bundle exceeds 1 MB");
    bundle = JSON.parse(await readFile(input, "utf8")) as unknown;
  } else {
    bundle = await fetcher.channel(input);
    if (values.out) await writeFile(values.out, `${JSON.stringify(bundle, null, 2)}\n`, { flag: "wx" });
  }
  const report = await verifyEvidence(bundle);
  if (values.json) console.log(JSON.stringify({ ...report, requests: fetcher.stats }, null, 2));
  else {
    console.log(
      `Channel: ${report.channelId}\nCaptured: ${report.capturedAt ?? "invalid bundle"}\nHTTP requests: ${fetcher.stats.requests}`,
    );
    for (const source of report.sources)
      console.log(`Evidence ${source.id}: ${source.source} ${source.tool} at ${source.measuredAt}`);
    for (const check of report.checks) console.log(`${check.status} ${check.id}: ${check.detail}`);
  }
  process.exitCode = report.exitCode;
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) console.log(JSON.stringify({ exitCode: 1, error: detail }));
  else console.error(detail);
  process.exitCode = 1;
});
