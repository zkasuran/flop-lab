// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { readRecording } from "./data";
import { HarnessWorkbench } from "./workbench";
import coverage from "./coverage-index.json";
import { fetchClaimHistory } from "../../../../packages/harness/src/history";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Conformance harness",
  description:
    "Explore recorded FLOP devnet checks. Compare claims with observed responses and copy a bounded reproduction command.",
};

export default async function HarnessPage() {
  const history = await fetchClaimHistory((url, init) => fetch(url, { ...init, next: { revalidate: 300 } }));
  return <HarnessWorkbench report={readRecording()} coverage={coverage} history={history} />;
}
