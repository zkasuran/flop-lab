// SPDX-License-Identifier: Apache-2.0
import { createHash, randomUUID } from "node:crypto";
import { paywall } from "./paywall.js";
import { payAndFetch } from "./client.js";
import { parseQuote, type Proof, type Quote } from "./protocol.js";
import { checkExchange, type Exchange, type Round } from "./checker.js";

const payTo = "MOCK-NO-FUNDS";

/** Create a deterministic mock token. It is not a chain transaction. @example mockProof(quote) */
export function mockProof(quote: Readonly<Quote>): Proof {
  return {
    hash_lock: quote.hashLock,
    htlc_id: `mock-${quote.requestId}`,
    tx_hash: `0x${createHash("sha256").update(`mock:${quote.hashLock}:${quote.requestId}`).digest("hex")}`,
  };
}

/** Local-only reference service with a mock header verifier and in-memory replay state. @example serve({ fetch: createMockService().fetch, hostname: "127.0.0.1", port: 3590 }) */
export function createMockService() {
  const quotes = new Map<string, Quote>();
  let executions = 0;
  const wall = paywall({
    priceFlop: "0.01",
    payTo,
    ttl: 60000,
    readPayment: async (proof) => {
      const quote = quotes.get(proof.hash_lock);
      if (!quote || JSON.stringify(proof) !== JSON.stringify(mockProof(quote))) return null;
      return {
        network: "flop-devnet",
        asset: "FLOP",
        status: "SETTLED",
        finalized: true,
        canonical: true,
        hashLock: quote.hashLock,
        htlcId: proof.htlc_id,
        txHash: proof.tx_hash,
        amountFlop: quote.priceFlop,
        payTo,
        blockHash: "0".repeat(64),
        source: "https://example.invalid/mock-ledger",
        observedAt: new Date().toISOString(),
      };
    },
  });
  return {
    async fetch(request: Request): Promise<Response> {
      if (new URL(request.url).pathname !== "/paid")
        return Response.json({ mock: true, route: "/paid", paymentExecution: "UNVERIFIED" });
      const response = await wall(request, () => {
        executions++;
        return Response.json({ mock: true, executions, result: "Mock protected response. No funds moved." });
      });
      response.headers.set("X-Flop-Mock", "true");
      if (response.status === 402 && response.headers.has("x-payment-price")) {
        const quote = parseQuote(response);
        quotes.set(quote.hashLock, quote);
      }
      return response;
    },
  };
}

function localRequest(url: string): Request {
  const target = new URL(url);
  if (
    target.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.hash
  )
    throw new Error("Use an HTTP loopback literal without credentials or a fragment");
  return new Request(target, {
    headers: { "X-Flop-Request-Id": randomUUID() },
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  });
}

async function boundedBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (reader)
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 65536) throw new Error("Response body exceeds 64 KiB");
        chunks.push(chunk.value);
      }
  } finally {
    void reader?.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}

function recorder(url: string, fetcher: typeof fetch) {
  const exchange: Exchange = {
    schemaVersion: 1,
    profile: "reference",
    source: url,
    measuredAt: new Date().toISOString(),
    rounds: [],
  };
  const recordedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const requestBody = await request.clone().text();
    const measuredAt = new Date().toISOString();
    const response = await fetcher(request);
    const body = await boundedBody(response);
    const round: Round = {
      measuredAt,
      request: { method: request.method, url: request.url, headers: [...request.headers], body: requestBody },
      response: { status: response.status, headers: [...response.headers], body },
    };
    exchange.rounds.push(round);
    return new Response([204, 205, 304].includes(response.status) ? null : body, {
      status: response.status,
      headers: response.headers,
    });
  };
  return { exchange, recordedFetch };
}

/** Probe a loopback paywall once. It cannot establish the paid half of a handshake. @example await probeLocal("http://127.0.0.1:3590/paid") */
export async function probeLocal(url: string, fetcher: typeof fetch = fetch) {
  const request = localRequest(url);
  const { exchange, recordedFetch } = recorder(url, fetcher);
  await recordedFetch(request);
  return { exchange, report: checkExchange(exchange) };
}

/** Run one challenge and one mock-proof retry against loopback. Never creates a wallet. @example await runMockClient("http://127.0.0.1:3590/paid") */
export async function runMockClient(url: string, fetcher: typeof fetch = fetch) {
  const request = localRequest(url);
  const { exchange, recordedFetch } = recorder(url, fetcher);
  let error: string | null = null;
  try {
    await payAndFetch(request, {
      expectedPayTo: payTo,
      maxFlop: "0.01",
      pay: async (quote) => mockProof(quote),
      fetch: async (input, init) => {
        const response = await recordedFetch(input, init);
        if (response.status === 402 && response.headers.get("x-flop-mock") !== "true")
          throw new Error("Server did not opt into the mock protocol");
        return response;
      },
    });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  return { exchange, report: checkExchange(exchange), error };
}
