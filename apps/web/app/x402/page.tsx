// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import run from "../../../../packages/x402kit/fixtures/run.json";
import { parsePreview } from "./data";
import { X402Workbench } from "./workbench";

export const metadata: Metadata = {
  title: "Pay-per-call kit",
  description:
    "Check both sides of a FLOP 402 exchange against quoted SDK rules. Inspect mock handshakes, replay and malformed headers.",
};

export default function X402Page() {
  return <X402Workbench run={run} initialPreview={parsePreview({ ...run.preview, mode: "recorded" })} />;
}
