// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { compare } from "../../../../packages/economics/src/compare";
import { recordedObservation } from "../../../../packages/economics/src/recorded";
import { EconomicsWorkbench } from "./workbench";

export const metadata: Metadata = {
  title: "Emission and fees",
  description: "Exact FLOP emission and payment calculators with a dated comparison against the pinned yellowpaper.",
};
export default function EconomicsPage() {
  try {
    const o = recordedObservation();
    return <EconomicsWorkbench report={compare(o)} payment={o.data.settlements?.[0]?.escrow ?? null} />;
  } catch {
    return (
      <section className="section">
        <h1>Economics recording unavailable.</h1>
        <p>The saved response did not validate. No chain comparison is shown.</p>
      </section>
    );
  }
}
