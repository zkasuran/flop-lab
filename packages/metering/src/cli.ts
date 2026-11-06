#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { accountWork, benchmark, decayWeight, leasePhase, renewal } from "./model";
import { parameters, rules } from "./rules";
import { recordedReport } from "./recorded";
import { createObserver } from "./live";
const help = `flop-metering: reference-work accounting and calibration evidence

Commands:
  observe [--live] [--json]    Dated recording by default
  work --components N,N [--bits 64|128] [--factor-ppb N] [--blocks N]
  phase --accepted N --at N   Declared latest acceptance or renewal block
  burst --cap N --blocks N --jobs N --work N --tier SOFT|HARD [--ceiling N]
  renew --at N --trigger N --cap N --next-cap N --empirical N --next-empirical N --jobs N --work N
  rules                      Pinned source quotations and defaults

All inputs are whole unsigned decimal integers. Work components are non-overlapping
declared reference FLOP, not tokens or physical operations. All calculators are local.
--json is supported by every command. No wallet or write transaction is used.
`;
try {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
      live: { type: "boolean" },
      ...Object.fromEntries(
        [
          "components",
          "bits",
          "factor-ppb",
          "blocks",
          "accepted",
          "at",
          "cap",
          "jobs",
          "work",
          "tier",
          "ceiling",
          "trigger",
          "next-cap",
          "empirical",
          "next-empirical",
        ].map((k) => [k, { type: "string" as const }]),
      ),
    },
  });
  if (v.help || !positionals.length) process.stdout.write(help);
  else {
    const command = positionals[0];
    if (positionals.length !== 1) throw Error("Unexpected positional argument");
    const get = (key: string, fallback?: string): string => {
      const values: Record<string, string | boolean | undefined> = v;
      const x = values[key] ?? fallback;
      if (typeof x !== "string") throw Error(`Missing --${key}`);
      return x;
    };
    let result: unknown;
    if (command === "observe") {
      const report = v.live ? await createObserver().run() : recordedReport();
      result = report;
      if (report.errors.length) process.exitCode = 2;
    } else if (command === "work") {
      const bits = get("bits", "128");
      if (bits !== "64" && bits !== "128") throw Error("--bits must be 64 or 128");
      const work = accountWork(get("components").split(","), bits === "64" ? 64 : 128);
      result = {
        ...work,
        rewardWeight: decayWeight(work.gn, get("factor-ppb", parameters.decayPpb), get("blocks", "0")),
      };
    } else if (command === "phase")
      result = { basis: "declared block scenario", ...leasePhase(get("accepted"), get("at"), parameters) };
    else if (command === "burst") {
      const tier = get("tier");
      if (tier !== "SOFT" && tier !== "HARD") throw Error("--tier must be SOFT or HARD");
      result = benchmark(
        {
          empirical: get("cap"),
          blocks: get("blocks"),
          jobs: get("jobs"),
          verifiedGn: get("work"),
          tier,
          ...(tier === "HARD" ? { ceiling: get("ceiling") } : {}),
        },
        parameters,
      );
    } else if (command === "renew")
      result = renewal(
        {
          current: get("at"),
          trigger: get("trigger"),
          cap: get("cap"),
          nextCap: get("next-cap"),
          empirical: get("empirical"),
          nextEmpirical: get("next-empirical"),
          jobs: get("jobs"),
          verifiedGn: get("work"),
        },
        parameters,
      );
    else if (command === "rules") result = { parameters, rules };
    else throw Error(`Unknown command ${command}`);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  }
} catch (e) {
  process.stderr.write(`flop-metering: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 2;
}
