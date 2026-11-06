// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { McpWorkbench } from "./workbench";

export const metadata: Metadata = {
  title: "Connect an agent to flop-lab",
  description:
    "Copy a local MCP config, inspect the server's generated tool contracts and follow a recorded settlement check.",
};

export default function McpPage() {
  return <McpWorkbench />;
}
