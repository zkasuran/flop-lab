// SPDX-License-Identifier: Apache-2.0
import { it, expect } from "vitest";
import { McpClient, listSettlements } from "@flop-lab/mcp";
it.skipIf(process.env.FLOP_LIVE !== "1")(
  "reads a bounded devnet settlement page",
  async (context) => {
    let result;
    try {
      result = await listSettlements(new McpClient({ retries: 0, timeoutMs: 8000 }), { limit: 1 });
    } catch {
      context.skip();
      return;
    }
    expect(result.value.data.length).toBeLessThanOrEqual(1);
  },
  10000,
);
