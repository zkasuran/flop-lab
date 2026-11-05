// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import recording from "../../tests/fixtures/models.json";
import { catalogSeed } from "./library";
import { Playground } from "./playground";

export const metadata: Metadata = {
  title: "Spend guard | FLOP lab",
  description:
    "Edit a budget policy. Replay scripted requests through the real Spendguard evaluator and inspect every decision.",
};

export default function SpendguardPage() {
  let seed = null;
  try {
    seed = catalogSeed(recording);
  } catch {
    // A malformed or absent observation must never produce invented miner identities.
  }
  return <Playground seed={seed} />;
}
