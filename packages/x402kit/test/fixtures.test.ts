// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { McpClient } from "@flop-lab/mcp";
import { createDemo } from "../src/demo.js";
import { parseQuote } from "../src/protocol.js";
import run from "../fixtures/run.json";
import recording from "../fixtures/mcp.json";

it("validates the recorded local HTTP quote without calling it a paid run", () => {
  const q = parseQuote(new Response(null, { headers: run.response.headers }));
  expect(q.executable).toBe(false);
  expect(run.paymentExecution).toBe("UNVERIFIED");
  expect(q.payTo).toBe("UNVERIFIED-NO-RECEIVING-ACCOUNT");
});

it("replays the raw recorded MCP response and caches it", async () => {
  let requests = 0;
  const raw = recording[0];
  if (!raw) throw new Error("Missing fixture");
  const app = createDemo(
    new McpClient({
      fetch: async () => {
        requests++;
        return new Response(raw.raw, { headers: { "Content-Type": "text/event-stream" } });
      },
    }),
  );
  for (let i = 0; i < 2; i++) {
    const result = await app.fetch(new Request("http://localhost/preview"));
    expect((await result.json()).rows).toEqual(run.preview.rows);
  }
  expect(requests).toBe(1);
});

it("compares the reference headers to the shipped SDK parser", async () => {
  const source = Buffer.from(
    await readFile(new URL("../fixtures/sdk-dist-x402.js.base64", import.meta.url), "utf8"),
    "base64",
  ).toString();
  // Execute only the recorded parser function. No SDK imports or wallet operations.
  const parser = source.slice(source.indexOf("export function parsePaymentHeaders"), source.indexOf("// ── x402Fetch"));
  const module = (await import(`data:text/javascript;base64,${Buffer.from(parser).toString("base64")}`)) as {
    parsePaymentHeaders: (r: Response) => { price: number; destination: string };
  };
  const payment = module.parsePaymentHeaders(new Response(null, { headers: run.response.headers }));
  expect(payment.price).toBe(Number(run.response.body.quote.priceFlop));
  expect(payment.destination).toBe(run.response.body.quote.payTo);
});
