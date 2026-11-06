#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { setTimeout } from "node:timers/promises";
import { parseRules, rulesYaml, example, integer } from "./config";
import { createCollector } from "./collect";
import { openWatcher, readBounded } from "./runtime";
import { parseSample } from "./observations";
import { replay } from "./engine";

const help = `flop watch: bounded local alerts over dated public observations

flop watch example                         Print a validated YAML rule file
flop watch check --rules watch.yaml         Validate rules without network calls
flop watch run --rules watch.yaml           Poll once and persist baselines
flop watch run --rules watch.yaml --polls 0  Poll until interrupted or request budget exhausted
flop watch replay --rules watch.yaml sample.json [sample.json ...]
flop watch drain --rules watch.yaml         Retry due persisted deliveries without polling

Options: --state watch-state.json --dead-letter failures.jsonl --polls 1
Request budget is per invocation and counts physical source attempts including retries.
Polling backs off on source failures. Webhook attempts are separately capped at three per alert.
Replay never contacts a network or sends notifications. Existing settlements establish a baseline.
`;
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      rules: { type: "string" },
      state: { type: "string", default: "watch-state.json" },
      "dead-letter": { type: "string" },
      polls: { type: "string", default: "1" },
    },
  });
  const [command = "help", ...files] = positionals;
  if (values.help || command === "help") {
    console.log(help);
    return;
  }
  if (command === "example") {
    console.log(rulesYaml(example));
    return;
  }
  if (!values.rules) throw new Error("--rules is required");
  const config = parseRules(await readBounded(values.rules, 64_000));
  if (command === "check") {
    console.log(
      JSON.stringify({
        valid: true,
        rules: config.rules.length,
        pollMs: config.pollMs,
        maxRequests: config.maxRequests,
      }),
    );
    return;
  }
  if (command === "replay") {
    if (!files.length) throw new Error("Provide recorded sample files");
    const samples = await Promise.all(files.map(async (p) => parseSample(JSON.parse(await readBounded(p, 2_000_000)))));
    replay(config, samples).forEach((result, i) =>
      console.log(JSON.stringify({ mode: "recorded", poll: i, alerts: result.alerts, notes: result.notes })),
    );
    return;
  }
  if (command !== "run" && command !== "drain") throw new Error("Unknown command");
  const polls = integer(Number(values.polls), 0, 100_000),
    stop = new AbortController();
  const onSignal = () => stop.abort();
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  const watcher = await openWatcher(
    values.state!,
    config,
    values["dead-letter"] ? { deadLetter: values["dead-letter"] } : {},
  );
  try {
    const collector = createCollector(config);
    let failures = 0;
    for (let poll = 0; !stop.signal.aborted && (polls === 0 || poll < polls); poll++) {
      if (command === "run") {
        const sample = await collector.collect(),
          result = await watcher.accept(sample);
        failures = sample.observations.some((o) => o.status !== "ok") ? failures + 1 : 0;
        console.error(
          JSON.stringify({
            measuredAt: sample.finishedAt,
            requests: sample.requests,
            totalRequests: collector.transport.requests,
            alerts: result.alerts.length,
            notes: result.notes,
          }),
        );
      }
      const delivered = await watcher.flush();
      console.error(JSON.stringify(delivered));
      if (command === "drain" || collector.transport.exhausted) break;
      if (polls === 0 || poll + 1 < polls)
        await setTimeout(Math.min(3_600_000, config.pollMs * 2 ** Math.min(failures, 6)), undefined, {
          signal: stop.signal,
        });
    }
  } catch (e) {
    if (!stop.signal.aborted) throw e;
  } finally {
    await watcher.close();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
