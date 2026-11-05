// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { readRecording } from "./data";
import { ContractsBoard } from "./workbench";

export const metadata: Metadata = {
  title: "MCP contract audit",
  description:
    "Inspect dated FLOP MCP schema violations, their raw requests and the trust material still missing from attestation checks.",
};

export default function ContractsPage() {
  return <ContractsBoard report={readRecording()} />;
}
