// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import recorded from "../../../../packages/verifier/fixtures/v2-channel.json";
import { parseEvidence, verifyEvidence } from "./library";
import { Verifier } from "./verifier";

export const metadata: Metadata = {
  title: "Settlement verifier",
  description: "Cross-check settlement views, receipts and attestation evidence. Replay FLOP devnet bundles locally.",
};

export default async function VerifyPage() {
  const bundle = parseEvidence(recorded);
  const report = await verifyEvidence(bundle);
  return <Verifier initialBundle={bundle} initialReport={report} />;
}
