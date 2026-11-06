#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { generateHashLock, planSwap, recordedObservations, SwapReader } from "./index";

const help = `flop-swaps: read-only swap timing and hash locks

  flop swap plan --flop-blocks 7200 --other-blocks 6 --other-block-ms 600000 --lag 0 --refund-head finalized --counter-refund-first
  flop swap generate
  flop swap check --hash-lock <64 hex characters>
  flop swap observe [--recorded]

plan: durations are remaining blocks from the same instant. --flop-block-ms defaults to 1000.
Missing --lag or ordering assumptions yield UNKNOWN. No result proves swap completion.
generate: preimage and SHA-256 stay local. No remote generator is called.
observe: first page only, FLOP_BTC/open. Live reads use a 30-second instance cache.
Exit: 0 success, 1 failed plan or unavailable read, 2 invalid input or unknown plan.
All output is JSON. No wallets or transactions.
`;
try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") console.log(help);
  else {
    const options: ParseArgsOptionsConfig | null =
      command === "plan"
        ? {
            "flop-blocks": { type: "string" as const },
            "other-blocks": { type: "string" as const },
            "flop-block-ms": { type: "string" as const, default: "1000" },
            "other-block-ms": { type: "string" as const },
            lag: { type: "string" as const },
            "refund-head": { type: "string" as const },
            "counter-refund-first": { type: "boolean" as const },
            help: { type: "boolean" as const },
          }
        : command === "check"
          ? { "hash-lock": { type: "string" as const }, help: { type: "boolean" as const } }
          : command === "observe"
            ? { recorded: { type: "boolean" as const }, help: { type: "boolean" as const } }
            : command === "generate"
              ? { help: { type: "boolean" as const } }
              : null;
    if (!options) throw new Error(`Unknown command: ${command}`);
    const { values } = parseArgs({ args, options, strict: true, allowPositionals: false });
    if (values.help) console.log(help);
    else {
      const string = (key: string, fallback?: string) => {
        const value = values[key];
        if (typeof value === "string") return value;
        if (fallback !== undefined) return fallback;
        throw new Error(`Missing --${key}`);
      };
      let result: unknown;
      if (command === "plan") {
        const head = string("refund-head", "unknown");
        if (head !== "finalized" && head !== "tip" && head !== "unknown") throw new Error("Invalid --refund-head");
        const plan = planSwap({
          flopBlocks: string("flop-blocks"),
          otherBlocks: string("other-blocks"),
          flopBlockMs: string("flop-block-ms"),
          otherBlockMs: string("other-block-ms"),
          currentFinalityLag: typeof values.lag === "string" ? values.lag : null,
          refundHead: head,
          counterRefundBeforeLateClaim: values["counter-refund-first"] === true ? true : null,
        });
        result = plan;
        process.exitCode = plan.status === "PASS" ? 0 : plan.status === "FAIL" ? 1 : 2;
      } else if (command === "generate") result = await generateHashLock();
      else if (command === "check") {
        const observation = await new SwapReader().check(string("hash-lock"));
        result = observation;
        if (observation.error || observation.value?.status === "UNKNOWN") process.exitCode = 1;
      } else {
        const report = values.recorded ? recordedObservations() : await new SwapReader().observe();
        result = report;
        if (report.swaps.error || report.htlcs.error) process.exitCode = 1;
      }
      console.log(JSON.stringify(result, null, 2));
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
