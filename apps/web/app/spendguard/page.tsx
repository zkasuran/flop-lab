// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import recording from "../../tests/fixtures/models.json";
import { catalogSeed } from "./library";
import { Playground } from "./playground";
import settlements from "../../../../packages/spendguard/fixtures/settlements.json";
import estimate from "../../../../packages/spendguard/fixtures/sdk-estimate.json";
import { settlementTape, estimateTape, type ReplayTape } from "../../../../packages/spendguard/src/replay";

export const metadata: Metadata = {
  title: "Spend guard | FLOP lab",
  description:
    "Lint shared budget policies and replay recorded settlement exposure with exact totals and full rule traces.",
};

export default function SpendguardPage() {
  let seed = null;
  try {
    seed = catalogSeed(recording);
  } catch {
    // A malformed or absent observation must never produce invented miner identities.
  }
  const tapes: ReplayTape[] = [];
  try {
    tapes.push(settlementTape(settlements));
  } catch {
    /* Invalid recordings show no data. */
  }
  try {
    tapes.push(estimateTape(estimate, { agent: "sdk-demo-agent", model: "sdk-demo-model", miner: "sdk-demo-miner" }));
  } catch {
    /* Invalid estimates show no data. */
  }
  return <Playground seed={seed} tapes={tapes} />;
}
