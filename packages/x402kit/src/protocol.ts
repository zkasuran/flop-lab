// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";

export class PaymentError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
    this.name = "PaymentError";
  }
}

export interface Quote {
  requestId: string;
  requestHash: string;
  hashLock: string;
  priceFlop: string;
  payTo: string;
  network: "flop-devnet";
  asset: "FLOP";
  timeoutBlocks: number;
  expiresAt: number;
  executable: boolean;
}

export interface Proof {
  hash_lock: string;
  htlc_id: string;
  tx_hash: string;
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PaymentError("invalid_object");
  return value as Record<string, unknown>;
}

export function text(value: unknown, max = 256): string {
  if (typeof value !== "string" || !value.length || value.length > max || /[^\x21-\x7e]/.test(value))
    throw new PaymentError("invalid_text");
  return value;
}

/** Parse decimal FLOP exactly. Exponents and fractional raw units are rejected. @example flopUnits("0.01") */
export function flopUnits(value: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,19})(\.\d{1,18})?$/.test(value))
    throw new PaymentError("invalid_amount");
  const [whole = "", fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}

export function hex(value: unknown): string {
  if (typeof value !== "string" || !/^(0x)?[a-fA-F0-9]{64}$/.test(value)) throw new PaymentError("invalid_hash");
  return value.replace(/^0x/, "").toLowerCase();
}

/** Validate the SDK's actual JSON proof format. @example parseProof(header) */
export function parseProof(header: string): Proof {
  if (header.length > 2048) throw new PaymentError("malformed_proof");
  try {
    const p = object(JSON.parse(header));
    return { hash_lock: hex(p.hash_lock), htlc_id: text(p.htlc_id), tx_hash: `0x${hex(p.tx_hash)}` };
  } catch {
    throw new PaymentError("malformed_proof");
  }
}

/** Hash the method, URL, body and application headers. @example await bindRequest(request) */
export async function bindRequest(request: Request): Promise<string> {
  // Bound body reads prevent buffering an unbounded input stream.
  const reader = request.clone().body?.getReader();
  const hash = createHash("sha256");
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 65536) throw new PaymentError("request_too_large", 413);
        hash.update(chunk.value);
      }
    } finally {
      void reader.cancel();
    }
  }
  const excluded = new Set([
    "x-payment-proof",
    "x-flop-request-id",
    "host",
    "connection",
    "content-length",
    "user-agent",
    "accept-encoding",
  ]);
  const headers = [...request.headers].filter(([key]) => !excluded.has(key));
  return createHash("sha256")
    .update(JSON.stringify([request.method, request.url, headers, hash.digest("hex")]))
    .digest("hex");
}

/** Emit SDK-compatible headers plus explicit local-reference extensions. @example quoteHeaders(quote) */
export function quoteHeaders(q: Quote): Headers {
  return new Headers({
    "X-Payment-Required": "true",
    "X-Payment-Price": q.priceFlop,
    "X-Payment-Hash-Lock": q.hashLock,
    "X-Payment-Timeout-Blocks": String(q.timeoutBlocks),
    "X-Payment-Destination": q.payTo,
    "X-Payment-Network": q.network,
    "X-Payment-Asset": q.asset,
    "X-Flop-Request-Id": q.requestId,
    "X-Flop-Request-Hash": q.requestHash,
    "X-Flop-Expires-At": String(q.expiresAt),
    "X-Flop-Executable": String(q.executable),
    "Cache-Control": "no-store",
  });
}

/** Parse strict SDK headers and required reference extensions. @example parseQuote(response) */
export function parseQuote(response: Response): Readonly<Quote> {
  const h = response.headers;
  const priceFlop = text(h.get("x-payment-price"));
  if (flopUnits(priceFlop) <= 0n) throw new PaymentError("invalid_amount");
  const expiry = h.get("x-flop-expires-at") ?? "";
  const timeout = h.get("x-payment-timeout-blocks") ?? "";
  if (!/^\d+$/.test(expiry) || !/^\d+$/.test(timeout)) throw new PaymentError("invalid_time");
  const expiresAt = Number(expiry),
    timeoutBlocks = Number(timeout);
  if (
    !Number.isSafeInteger(expiresAt) ||
    !Number.isSafeInteger(timeoutBlocks) ||
    timeoutBlocks < 1 ||
    timeoutBlocks > 7200
  )
    throw new PaymentError("invalid_time");
  if (h.get("x-payment-network") !== "flop-devnet" || h.get("x-payment-asset") !== "FLOP")
    throw new PaymentError("unsupported_network_or_asset");
  if (!["true", "false"].includes(h.get("x-flop-executable") ?? "")) throw new PaymentError("invalid_capability");
  return Object.freeze({
    requestId: text(h.get("x-flop-request-id")),
    requestHash: hex(h.get("x-flop-request-hash")),
    hashLock: hex(h.get("x-payment-hash-lock")),
    priceFlop,
    payTo: text(h.get("x-payment-destination")),
    network: "flop-devnet",
    asset: "FLOP",
    expiresAt,
    timeoutBlocks,
    executable: h.get("x-flop-executable") === "true",
  });
}
