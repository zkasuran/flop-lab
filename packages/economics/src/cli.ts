#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  compare,
  EconomicsCollector,
  recordedObservation,
  integer,
  parseFlop,
  rewardAt,
  rewardSplit,
  subsidyAt,
  supplyAt,
  paymentSplit,
  SPEC,
} from "./index";

const help = `flop-economics: exact pinned economics and dated devnet comparisons

flop-economics reward <block> [--json]
flop-economics supply <block> [--json]
flop-economics payment <FLOP> [--fee <FLOP>] [--tip <FLOP>] [--json]
flop-economics compare [--live] [--save <file>] [--json]

Amounts in output are exact base units (10^-18 FLOP).
Default compare replays the bundled recording. --live makes a bounded public read.
--save requires --live and writes raw evidence without overwriting an existing file.
DRIFT means disagreement with the pinned target. UNOBSERVABLE means missing evidence.
Exit 0: result available. Exit 1: input or observation error.
`;
try {
  const { values, positionals } = parseArgs({
    options: {
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
      live: { type: "boolean" },
      save: { type: "string" },
      fee: { type: "string" },
      tip: { type: "string" },
    },
    allowPositionals: true,
  });
  if (values.help || positionals.length === 0) console.log(help);
  else {
    const [command, arg] = positionals;
    const isCompare = command === "compare";
    if (positionals.length !== (isCompare ? 1 : 2)) throw new Error("Unexpected or missing argument. Use --help.");
    if ((values.live || values.save) && !isCompare) throw new Error("--live and --save require compare");
    if ((values.fee || values.tip) && command !== "payment") throw new Error("--fee and --tip require payment");
    let result: unknown;
    if (isCompare) {
      if (values.save && !values.live) throw new Error("--save requires --live");
      const o = values.live ? await new EconomicsCollector().collect() : recordedObservation();
      if (values.save)
        await writeFile(
          values.save,
          JSON.stringify({ source: o.source, measuredAt: o.measuredAt, query: o.query, raw: o.raw }, null, 2) + "\n",
          { flag: "wx" },
        );
      result = compare(o);
    } else {
      const value = arg!;
      const model =
        command === "reward"
          ? {
              reward: rewardAt(integer(value)),
              pools: rewardSplit(integer(value)),
              subsidyPerRecipient: subsidyAt(integer(value)),
            }
          : command === "supply"
            ? supplyAt(integer(value))
            : command === "payment"
              ? paymentSplit(parseFlop(value), parseFlop(values.fee ?? "0"), parseFlop(values.tip ?? "0"))
              : null;
      if (!model) throw new Error("Unknown command. Use --help.");
      result = {
        kind: "pinned-spec-calculation",
        calculatedAt: new Date().toISOString(),
        source: SPEC.source,
        input: value,
        unit: "base units",
        model,
      };
    }
    console.log(
      JSON.stringify(
        result,
        (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v),
        values.json ? undefined : 2,
      ),
    );
  }
} catch (e) {
  console.error(`flop-economics: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
