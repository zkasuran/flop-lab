// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import manifest from "../fixtures/sdk-manifest.json";
import type { Exchange } from "../src/checker.js";

interface MockClient {
  createHtlc(): Promise<{ htlcId: string; txHash: string }>;
  waitForSettlement(): Promise<{ status: string }>;
}

/** Run the pinned real SDK against a scripted transport. No wallet modules are imported. @example await sdkTrace("class") */
export async function sdkTrace(kind: "class" | "function") {
  const bytes = Buffer.from(
    await readFile(new URL("../fixtures/sdk-dist-x402.js.base64", import.meta.url), "utf8"),
    "base64",
  );
  if (createHash("sha256").update(bytes).digest("hex") !== manifest[0]?.sha256)
    throw new Error("SDK fixture hash mismatch");
  // Remove the unrelated constant re-export and relative source-map comment. Handshake code stays intact.
  const source = bytes
    .toString()
    .replace(/^export \{ X402_HEADERS \} from "\.\/x402-types\/index.js";\s*/, "")
    .replace(/^\/\/# sourceMappingURL=.*$/m, "");
  const sdk = (await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)) as {
    x402Fetch(client: MockClient, url: string): Promise<Response>;
    X402Client: new (options: { gatewayUrl: string; flopClient: MockClient }) => {
      fetch(url: string): Promise<Response>;
    };
  };
  const url = "https://fixture.invalid/paid";
  const exchange: Exchange = {
    schemaVersion: 1,
    profile: "sdk-0.4.0",
    source: `${manifest[0]!.source} with scripted HTTP and mock HTLC methods (${kind})`,
    measuredAt: new Date().toISOString(),
    rounds: [],
  };
  let mockPayments = 0;
  const client: MockClient = {
    async createHtlc() {
      mockPayments++;
      return { htlcId: "mock-htlc", txHash: `0x${"b".repeat(64)}` };
    },
    async waitForSettlement() {
      return { status: "SETTLED" };
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const response = request.headers.has("x-payment-proof")
      ? new Response("mock result")
      : exchange.rounds.length
        ? new Response("synthetic repeated unpaid refusal", { status: 429 })
        : new Response("mock challenge", {
            status: 402,
            headers: {
              "x-payment-price": "0.01",
              "x-payment-hash-lock": "a".repeat(64),
              "x-payment-timeout-blocks": "60",
              "x-payment-destination": "mock-payee",
            },
          });
    exchange.rounds.push({
      measuredAt: new Date().toISOString(),
      request: { url: request.url, method: request.method, headers: [...request.headers], body: await request.text() },
      response: { status: response.status, headers: [...response.headers], body: await response.clone().text() },
    });
    return response;
  };
  try {
    const response =
      kind === "class"
        ? await new sdk.X402Client({ gatewayUrl: url, flopClient: client }).fetch(url)
        : await sdk.x402Fetch(client, url);
    return { exchange, mockPayments, status: response.status };
  } finally {
    globalThis.fetch = original;
  }
}
