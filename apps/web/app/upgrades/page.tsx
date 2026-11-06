// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { recordedReport } from "../../../../packages/upgrades/src/recorded";
import { UpgradesView } from "./view";

export const metadata: Metadata = {
  title: "Upgrade tracker | flop-lab",
  description:
    "Compare dated spec revisions, package releases and observable runtime versions. Every entry retains its source and clock.",
};

export default function UpgradesPage() {
  return <UpgradesView report={recordedReport()} />;
}
