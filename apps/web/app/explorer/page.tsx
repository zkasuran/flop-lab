// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { parseIndexerData } from "@flop-lab/mcp";
import proof from "../../../../packages/mcp/fixtures/indexer-pouiProofs.json";
import { recordedExploration } from "../../../../packages/explorer/src/recorded";
import { Workbench } from "./workbench";

export const metadata: Metadata = {
  title: "Chain explorer",
  description:
    "Search FLOP blocks, transactions, accounts, channels and HTLCs. Follow each value back to a dated public query.",
};
export default function ExplorerPage() {
  const proofs = parseIndexerData("pouiProofs", JSON.parse(proof.raw));
  return (
    <Workbench
      initial={recordedExploration("channel")}
      emptyProofs={{ count: proofs.length, measuredAt: proof.measuredAt, source: proof.source, query: proof.query }}
    />
  );
}
