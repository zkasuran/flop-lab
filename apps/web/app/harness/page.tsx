// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { readRecording } from "./data";
import { HarnessWorkbench } from "./workbench";

export const metadata: Metadata = {
  title: "Conformance harness",
  description:
    "Explore recorded FLOP devnet checks. Compare claims with observed responses and copy a bounded reproduction command.",
};

export default function HarnessPage() {
  return <HarnessWorkbench report={readRecording()} />;
}
