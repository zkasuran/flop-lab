// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import recorded from "../../../../packages/verifier/fixtures/channel-1.json";
import { parseEvidence, verifyEvidence } from "./library";
import { Verifier } from "./verifier";

export const metadata: Metadata = {
  title: "Settlement verifier",
  description:
    "Check settlement arithmetic, inspect the evidence and replay a saved FLOP devnet bundle in your browser.",
};

export default async function VerifyPage() {
  const bundle = parseEvidence(recorded);
  const report = await verifyEvidence(bundle);
  return <Verifier initialBundle={bundle} initialReport={report} />;
}
