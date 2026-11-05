// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import run from "../../../../packages/x402kit/fixtures/run.json";
import { parsePreview } from "./data";
import { X402Workbench } from "./workbench";

export const metadata: Metadata = {
  title: "Pay-per-call kit",
  description:
    "Replay real FLOP SDK headers, inspect a bounded payment flow and see where chain evidence is still missing.",
};

export default function X402Page() {
  return <X402Workbench run={run} initialPreview={parsePreview({ ...run.preview, mode: "recorded" })} />;
}
