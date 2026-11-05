// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { auditSnapshot } from "../../../../packages/indexer-audit/src/audit";
import recorded from "../../../../packages/indexer-audit/fixtures/devnet.json";
import { InvariantBoard } from "./board";

export const metadata: Metadata = {
  title: "Indexer audit",
  description:
    "Inspect dated indexer consistency checks. Expand a result to compare its values, sources and arithmetic.",
};

export default function IndexerPage() {
  return <InvariantBoard report={auditSnapshot(recorded)} />;
}
