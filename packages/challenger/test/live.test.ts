// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { McpClient, McpError } from "@flop-lab/mcp";
import { collectTape } from "../src/index";

it.skipIf(process.env.FLOP_LIVE !== "1")(
  "reads public settlements with bounded requests",
  async (context) => {
    try {
      const tape = await collectTape(new McpClient({ retries: 0, timeoutMs: 5000 }), { maxRows: 100 });
      expect(tape.settlements.length).toBeLessThanOrEqual(100);
      expect(tape.source).toBe("https://mcp.flop.network/mcp");
    } catch (error) {
      if (error instanceof McpError && ["network", "timeout", "http"].includes(error.kind)) {
        context.skip();
        return;
      }
      throw error;
    }
  },
  25_000,
);
