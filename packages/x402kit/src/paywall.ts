// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { flopUnits, hex, object, parseProof, PaymentError, quoteHeaders, text } from "./protocol.js";
import { bindRequest } from "./binding.js";
import type { Proof, Quote } from "./protocol.js";
import { MemoryStore } from "./store.js";
import type { ReplayStore, SavedResponse } from "./store.js";

export interface PaywallOptions {
  priceFlop: string;
  payTo: string;
  /** Quote lifetime in milliseconds. Not the on-chain timeout. */
  ttl: number;
  timeoutBlocks?: number;
  store?: ReplayStore;
  /** Trusted adapter: independently read finalized chain state. Never return fields from the request. */
  readPayment?: (proof: Readonly<Proof>) => Promise<unknown>;
  now?: () => number;
}

function failure(error: unknown): Response {
  const e = error instanceof PaymentError ? error : new PaymentError("verification_unavailable", 503);
  return Response.json({ error: e.code }, { status: e.status, headers: { "Cache-Control": "no-store" } });
}

/** Validate independently observed payment state. This does not fetch chain state. @example verifyObservedPayment(observed, proof, quote) */
export function verifyObservedPayment(value: unknown, proof: Proof, quote: Quote): void {
  const o = object(value);
  if (o.network !== "flop-devnet" || o.asset !== "FLOP") throw new PaymentError("wrong_network", 402);
  if (o.finalized !== true || o.canonical !== true || o.status !== "SETTLED")
    throw new PaymentError("not_finalized", 409);
  if (hex(o.hashLock) !== quote.hashLock || text(o.htlcId) !== proof.htlc_id || hex(o.txHash) !== hex(proof.tx_hash))
    throw new PaymentError("payment_mismatch", 402);
  if (o.payTo !== quote.payTo) throw new PaymentError("wrong_payee", 402);
  if (typeof o.amountFlop !== "string" || flopUnits(o.amountFlop) !== flopUnits(quote.priceFlop))
    throw new PaymentError("amount_mismatch", 402);
  // Evidence metadata is mandatory but is not a cryptographic finality proof.
  if (
    typeof o.observedAt !== "string" ||
    !Number.isFinite(Date.parse(o.observedAt)) ||
    typeof o.source !== "string" ||
    !o.source.startsWith("https://")
  )
    throw new PaymentError("missing_provenance", 503);
  hex(o.blockHash);
}

async function saveResponse(response: Response): Promise<SavedResponse> {
  const chunks: Uint8Array[] = [];
  const reader = response.body?.getReader();
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 1048576) throw new PaymentError("response_too_large", 503);
        chunks.push(part.value);
      }
    } finally {
      void reader.cancel();
    }
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return { status: response.status, headers: [...headers], body: Buffer.concat(chunks).toString("base64") };
}
function restore(r: SavedResponse): Response {
  return new Response([204, 205, 304].includes(r.status) ? null : Buffer.from(r.body, "base64"), {
    status: r.status,
    headers: r.headers,
  });
}

/** Create a request-bound paywall. Without readPayment every proof fails closed. @example const wall = paywall({ priceFlop: "0.01", payTo: address, ttl: 60000 }) */
export function paywall(options: PaywallOptions) {
  if (flopUnits(options.priceFlop) <= 0n) throw new PaymentError("invalid_amount");
  text(options.payTo);
  if (!Number.isSafeInteger(options.ttl) || options.ttl < 1 || options.ttl > 300000)
    throw new PaymentError("invalid_ttl");
  const timeoutBlocks = options.timeoutBlocks ?? 60;
  if (!Number.isSafeInteger(timeoutBlocks) || timeoutBlocks < 1 || timeoutBlocks > 7200)
    throw new PaymentError("invalid_timeout");
  const store = options.store ?? new MemoryStore(),
    now = options.now ?? Date.now;
  const inFlight = new Map<string, { proof: string | undefined; work: Promise<SavedResponse> }>();

  return async (request: Request, handler: (request: Request) => Promise<Response> | Response): Promise<Response> => {
    try {
      const requestId = text(request.headers.get("x-flop-request-id"));
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(requestId)) throw new PaymentError("invalid_request_id");
      const key = createHash("sha256").update(requestId).digest("hex");
      const requestHash = await bindRequest(request);
      const raw = request.headers.get("x-payment-proof");
      const proof = raw === null ? undefined : parseProof(raw);
      const canonical = proof ? JSON.stringify(proof) : undefined;
      const entry = await store.transaction((state) => {
        let entry = state.entries[key];
        if (entry && entry.quote.requestHash !== requestHash) throw new PaymentError("request_mismatch", 409);
        if (!entry) {
          if (proof) throw new PaymentError("unknown_quote", 402);
          if (Object.keys(state.entries).length >= 10000) throw new PaymentError("store_capacity", 503);
          entry = {
            quote: {
              requestId,
              requestHash,
              hashLock: randomBytes(32).toString("hex"),
              priceFlop: options.priceFlop,
              payTo: options.payTo,
              network: "flop-devnet",
              asset: "FLOP",
              expiresAt: now() + options.ttl,
              timeoutBlocks,
              executable: Boolean(options.readPayment),
            },
          };
          state.entries[key] = entry;
        }
        return entry;
      });
      if (!proof)
        return Response.json(
          {
            error: "payment_required",
            verification: options.readPayment ? "adapter_required" : "UNVERIFIED",
            quote: entry.quote,
          },
          { status: 402, headers: quoteHeaders(entry.quote) },
        );
      if (entry.proof && entry.proof !== canonical) throw new PaymentError("request_already_paid", 409);
      if (entry.response) return restore(entry.response);
      const pending = inFlight.get(key);
      if (pending) {
        if (pending.proof !== canonical) throw new PaymentError("request_already_paid", 409);
        return restore(await pending.work);
      }
      if (entry.proof) throw new PaymentError("payment_pending_reconciliation", 409);
      if (now() >= entry.quote.expiresAt) throw new PaymentError("quote_expired", 410);
      if (proof.hash_lock !== entry.quote.hashLock) throw new PaymentError("payment_mismatch", 402);
      if (!options.readPayment) throw new PaymentError("chain_adapter_unverified", 503);
      const readPayment = options.readPayment;
      const work = (async () => {
        verifyObservedPayment(await readPayment(Object.freeze(proof)), proof, entry.quote);
        if (now() >= entry.quote.expiresAt) throw new PaymentError("quote_expired", 410);
        // Claim atomically before the handler. A crash leaves a tombstone, never a second execution.
        await store.transaction((state) => {
          const stored = state.entries[key];
          if (!stored || stored.proof) throw new PaymentError("payment_pending_reconciliation", 409);
          if (state.used[proof.tx_hash] || state.used[`htlc:${proof.htlc_id}`])
            throw new PaymentError("payment_replayed", 409);
          stored.proof = canonical;
          state.used[proof.tx_hash] = key;
          state.used[`htlc:${proof.htlc_id}`] = key;
        });
        let response: SavedResponse;
        try {
          response = await saveResponse(await handler(request));
        } catch {
          response = await saveResponse(failure(new PaymentError("handler_failed", 500)));
        }
        await store.transaction((state) => {
          const stored = state.entries[key];
          if (!stored) throw new Error("entry_missing");
          stored.response = response;
        });
        return response;
      })();
      inFlight.set(key, { proof: canonical, work });
      try {
        return restore(await work);
      } finally {
        inFlight.delete(key);
      }
    } catch (e) {
      return failure(e);
    }
  };
}

/** Hono adapter for the same fetch-style paywall. @example app.use("/paid", honoPaywall(options)) */
export function honoPaywall(options: PaywallOptions): MiddlewareHandler {
  const wall = paywall(options);
  return async (context, next) =>
    wall(context.req.raw, async () => {
      await next();
      return context.res;
    });
}
