#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { Explorer, formatExploration } from "./index";

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: { json: { type: "boolean" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) {
    console.log(
      "flop-explorer <block number | 0x hash | SS58 address> [--json]\nOptional prefixes: block: tx: account: channel: htlc:\nRead-only devnet evidence. Unknown hashes check all four hash kinds.\nExit: 0 found; 2 no indexed match; 3 unavailable or partial; 1 invalid input.",
    );
    return;
  }
  if (positionals.length !== 1) throw new Error("Provide one search input. Use --help for syntax.");
  const result = await new Explorer().search(positionals[0]!);
  console.log(values.json ? JSON.stringify(result, null, 2) : formatExploration(result));
  process.exitCode = result.status === "not_found" ? 2 : ["partial", "unavailable"].includes(result.status) ? 3 : 0;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
