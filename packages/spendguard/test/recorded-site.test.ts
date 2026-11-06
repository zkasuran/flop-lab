// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import recording from "../fixtures/settlements.json";
import example from "../examples/tape-policy.json";
import { settlementTape, replayTape } from "../src/replay";
import { lintPolicy } from "../src/lint";
import { tapePolicy } from "../../../apps/web/app/spendguard/recorded";

it("keeps the browser preset and runnable CLI example aligned to the recording", () => {
  const tape = settlementTape(recording),
    policy = tapePolicy(tape);
  expect(policy).toEqual(example);
  expect(lintPolicy(policy).findings).toEqual([]);
  expect(replayTape(policy, tape).totals).toMatchObject({
    allowed: 7,
    refused: 93,
    allowedFlop: "9.990000000000000164",
  });
  expect(tapePolicy({ ...tape, rows: [] }).allowModels).toEqual([]);
});
