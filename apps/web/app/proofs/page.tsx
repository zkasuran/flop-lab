// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { recordedProofs, recordedHistory } from "../../../../packages/proofs/src/recorded";
import { proofReference } from "../../../../packages/proofs/src/reference";
import { ProofBoard } from "./board";
import { proofView } from "./view";
export const metadata: Metadata = {
  title: "Proof explorer",
  description:
    "Read the FLOP verification architecture, dated proof observations and the public evidence limits for each settlement.",
};
export default function ProofPage() {
  try {
    return <ProofBoard view={proofView(recordedProofs())} reference={proofReference()} history={recordedHistory()} />;
  } catch {
    return (
      <section className="section">
        <h1>Proof recording unavailable.</h1>
        <p>The saved data could not be validated. No proof or coverage counts are shown.</p>
      </section>
    );
  }
}
