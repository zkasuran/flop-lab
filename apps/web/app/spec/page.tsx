// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { recordedReport } from "../../../../packages/spec/src/recorded";
import { SpecWorkbench } from "./workbench";

export const metadata: Metadata = {
  title: "Spec differ",
  description:
    "Compare pinned yellowpaper clauses with dated public FLOP observations. Inspect catalog agreement, missing evidence and exact differences.",
};

export default function SpecPage() {
  try {
    return <SpecWorkbench report={recordedReport()} />;
  } catch {
    return (
      <section className="section">
        <h1>Spec recording unavailable.</h1>
        <p>The saved evidence could not be validated. No comparison counts are shown.</p>
      </section>
    );
  }
}
