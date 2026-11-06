// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { recordedObservations } from "../../../../packages/swaps/src/observed";
import { SwapView } from "./view";

export const metadata: Metadata = {
  title: "Swap planner | flop-lab",
  description: "Check declared HTLC timing, generate local hash locks and inspect dated devnet observations.",
};

export default function SwapsPage() {
  return <SwapView report={recordedObservations()} />;
}
