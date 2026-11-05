// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { bindRequest, flopUnits, parseProof, parseQuote, PaymentError } from "./protocol.js";
import type { Proof, Quote } from "./protocol.js";

export interface PayAndFetchOptions {
  maxFlop: string;
  expectedPayTo: string;
  /** Caller supplies an audited devnet payment adapter. Called at most once. */
  pay: (quote: Readonly<Quote>) => Promise<Proof>;
  authorize?: (quote: Readonly<Quote>) => Promise<boolean> | boolean;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}

/** Probe, enforce the ceiling and pay once. No automatic retry after payment. @example await payAndFetch(request, { maxFlop: "0.01", expectedPayTo: address, pay }) */
export async function payAndFetch(input: Request, options: PayAndFetchOptions): Promise<Response> {
  const ceiling = flopUnits(options.maxFlop);
  const fetcher = options.fetch ?? globalThis.fetch,
    now = options.now ?? Date.now;
  const headers = new Headers(input.headers);
  if (headers.has("x-payment-proof")) throw new PaymentError("existing_payment_proof");
  if (!headers.has("x-flop-request-id")) headers.set("x-flop-request-id", randomUUID());
  const request = new Request(input, { headers, redirect: "error" });
  const binding = await bindRequest(request);
  const response = await fetcher(request.clone());
  if (response.status !== 402) return response;
  const quote = parseQuote(response);
  const check = () => {
    request.signal.throwIfAborted();
    if (quote.requestId !== headers.get("x-flop-request-id") || quote.requestHash !== binding)
      throw new PaymentError("request_mismatch");
    if (quote.payTo !== options.expectedPayTo) throw new PaymentError("payee_changed");
    if (flopUnits(quote.priceFlop) > ceiling) throw new PaymentError("ceiling_exceeded");
    if (now() >= quote.expiresAt) throw new PaymentError("quote_expired");
    if (!quote.executable) throw new PaymentError("chain_adapter_unverified");
  };
  check();
  if (options.authorize && (await options.authorize(quote)) !== true) throw new PaymentError("policy_denied");
  check();
  const proof = parseProof(JSON.stringify(await options.pay(quote)));
  if (proof.hash_lock !== quote.hashLock) throw new PaymentError("payment_mismatch");
  headers.set("X-Payment-Proof", JSON.stringify(proof));
  // If this request fails, reconcile the existing proof. Do not call pay again.
  return fetcher(new Request(request, { headers, redirect: "error" }));
}
