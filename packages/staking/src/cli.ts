#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { commission, minerStake, unbonding } from "./model";
import { slashStake } from "./model";
import { createObserver } from "./live";
import { offences, parameters, recordedReport } from "./recorded";

const help = `flop-staking: read-only documented stake scenarios and indexed evidence

flop-staking miner --gflop N [--commission PERCENT] [--json]
flop-staking validator [--json]
flop-staking slash --offence ID [--stake FLOP] [--json]
flop-staking observed [--live] [--json]

Offences: ${offences.map((o) => o.id).join(", ")}
Omit --stake to show the quoted rule without inventing a balance.
Miner values use recorded catalog defaults, not runtime storage.
Observed defaults to the dated recording; --live makes bounded public reads.
No wallets or transactions. See each result's source and measuredAt.
`;
try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
      live: { type: "boolean" },
      gflop: { type: "string" },
      commission: { type: "string" },
      offence: { type: "string" },
      stake: { type: "string" },
    },
  });
  if (values.help || !positionals.length) console.log(help);
  else {
    if (positionals.length !== 1) throw new Error("Expected one command");
    const cmd = positionals[0];
    const allowed: Record<string, string[]> = {
      miner: ["gflop", "commission", "json"],
      validator: ["json"],
      slash: ["offence", "stake", "json"],
      observed: ["live", "json"],
    };
    if (!cmd || !Object.hasOwn(allowed, cmd)) throw new Error("Unknown command; use --help");
    for (const key of Object.keys(values))
      if (!allowed[cmd]!.includes(key)) throw new Error(`--${key} is not valid for ${cmd}`);
    let result: unknown;
    if (cmd === "miner") {
      if (values.gflop === undefined) throw new Error("miner requires --gflop N");
      result = {
        ...minerStake(values.gflop, parameters),
        unbonding: unbonding("miner", parameters),
        ...(values.commission === undefined ? {} : { commission: commission(values.commission, parameters) }),
      };
    } else if (cmd === "validator")
      result = {
        basis: "documented baseline",
        baselineFlop: parameters.validatorBaseline,
        effectiveFloor: "max(baseline, value-coupled floor), ratcheted. Read current runtime state before sizing.",
        unbonding: unbonding("validator", parameters),
        citation: parameters.citations.validatorBaseline,
      };
    else if (cmd === "slash") {
      const offence = offences.find((o) => o.id === values.offence);
      if (!offence) throw new Error("Unknown or missing --offence; use --help");
      result = values.stake === undefined ? offence : slashStake(values.stake, offence);
    } else result = values.live ? await createObserver().run() : recordedReport();
    // JSON is the stable CLI report format, with readable indentation by default.
    console.log(JSON.stringify(result, null, values.json ? undefined : 2));
  }
} catch (e) {
  console.error(`flop-staking: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
