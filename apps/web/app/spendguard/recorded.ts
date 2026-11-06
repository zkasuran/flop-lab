// SPDX-License-Identifier: Apache-2.0
import type { Policy } from "../../../../packages/spendguard/src/policy";
import type { ReplayTape } from "../../../../packages/spendguard/src/replay";

/** Chosen limits with exact recorded identities. This does not infer suitable budgets. @example tapePolicy(tape) */
export function tapePolicy(tape: ReplayTape): Policy {
  return {
    version: 1,
    budgets: { task: "10", hour: "10", day: "10", total: "10" },
    maxPricePerGflop: "1",
    maxEscrowPerSession: "5",
    allowModels: [...new Set(tape.rows.flatMap((row) => (row.model === null ? [] : [row.model])))],
    allowMiners: [...new Set(tape.rows.map((row) => row.miner))],
    denyMiners: [],
    modelCaps: {},
    minerCaps: {},
    requireDryRun: true,
    cooldown: 0,
  };
}
