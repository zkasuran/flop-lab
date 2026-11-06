// SPDX-License-Identifier: Apache-2.0
import { runTurn } from "./agent";
import { recordedSources, liveSources } from "./inputs";

const args = process.argv.slice(2);
if (args.some((arg) => !["--observe", "--dry-run"].includes(arg))) {
  console.error("Usage: pnpm start [--observe] [--dry-run]. All CLI modes are dry runs.");
  process.exitCode = 2;
} else {
  try {
    const observe = args.includes("--observe");
    const started = performance.now();
    const live = observe ? liveSources() : undefined;
    const replay = live ? undefined : await recordedSources();
    // One bounded iteration. Add intents here only after defining total-budget semantics.
    for (const maxFlop of ["__MAX_FLOP__"]) {
      const result = await runTurn({
        sources: live?.sources ?? replay!.sources,
        maxFlop,
        ledgerPath: ".agent-ledger.jsonl",
        dryRun: true,
        ...(replay ? { now: replay.now } : {}),
      });
      console.log(
        JSON.stringify(
          {
            mode: observe ? "live-read-only" : "recorded-dry-run",
            measuredAt: new Date().toISOString(),
            networkRequests: live?.requests() ?? 0,
            durationMs: performance.now() - started,
            result,
          },
          null,
          2,
        ),
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
