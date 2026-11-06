#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { generateAgent } from "./index";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { help: { type: "boolean" }, "max-flop": { type: "string" }, workspace: { type: "string" } },
  });
  if (values.help)
    console.log(
      "create-flop-agent <new-dir> [--max-flop 0.1] [--workspace <flop-lab>]\nGenerate an offline-first devnet agent. Ceiling: 1 FLOP. No paid transport ships.",
    );
  else {
    if (positionals.length !== 1)
      throw new Error("Usage: create-flop-agent <new-dir> [--max-flop 0.1] [--workspace <flop-lab>]");
    const started = performance.now();
    const result = await generateAgent({
      directory: positionals[0]!,
      maxFlop: values["max-flop"],
      workspace: values.workspace,
    });
    console.log(
      JSON.stringify(
        { ...result, measuredAt: new Date().toISOString(), durationMs: performance.now() - started },
        null,
        2,
      ),
    );
    console.log("Run in the generated directory: pnpm install --no-frozen-lockfile; pnpm check; pnpm start");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
