// SPDX-License-Identifier: Apache-2.0
import { Hono } from "hono";
import { McpClient, listSettlements, escrowConserved, DEFAULT_URL } from "@flop-lab/mcp";
import { honoPaywall } from "./paywall.js";

/** Build the read-only demo. The protected route fails closed. @example createDemo().fetch(request) */
export function createDemo(client = new McpClient({ retries: 1, timeoutMs: 8000 })) {
  const app = new Hono();
  let expires = 0;
  let cached: unknown;
  let pending: Promise<unknown> | undefined;
  const preview = async () => {
    if (cached && Date.now() < expires) return cached;
    pending ??= (async () => {
      try {
        const result = await listSettlements(client, { limit: 5 });
        cached = {
          status: result.value.data.length ? "observed" : "no_data",
          source: DEFAULT_URL,
          measuredAt: result.measuredAt,
          cacheTtlMs: 60000,
          verification: "Arithmetic only. Not chain finality or inference verification.",
          rows: result.value.data.map((s) => ({
            channelId: s.channelId,
            settledBlock: s.settledBlock,
            minerPaid: s.minerPaid,
            escrowConserved: escrowConserved(s),
          })),
        };
      } catch {
        cached = {
          status: "unavailable",
          source: DEFAULT_URL,
          attemptedAt: new Date().toISOString(),
          rows: [],
          error: "MCP unavailable or invalid response",
        };
      }
      expires = Date.now() + 60000;
      return cached;
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  };
  app.get("/", (c) =>
    c.json({
      tool: "flop-x402",
      paymentExecution: "UNVERIFIED",
      preview: "/preview",
      protected: "/settlements",
      message: "No audited chain adapter is configured. Do not fund the quote.",
    }),
  );
  app.get("/preview", async (c) => c.json(await preview()));
  app.use("/settlements", honoPaywall({ priceFlop: "0.01", payTo: "UNVERIFIED-NO-RECEIVING-ACCOUNT", ttl: 60000 }));
  app.get("/settlements", async (c) => c.json(await preview()));
  return app;
}
