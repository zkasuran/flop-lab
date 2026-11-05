// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { recordedConsole } from "../../../../packages/console/src/recorded";
import { ConsoleWorkbench } from "./workbench";

export const metadata: Metadata = {
  title: "MCP console",
  description:
    "Call read-only FLOP tools, explore the indexer and compare dated devnet cost estimates with their exact requests.",
};

export default function ConsolePage() {
  return <ConsoleWorkbench initial={recordedConsole()} />;
}
