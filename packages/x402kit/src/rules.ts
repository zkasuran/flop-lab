// SPDX-License-Identifier: Apache-2.0
const artifact = "https://unpkg.com/@flop-labs/sdk@0.4.0/dist/x402.js";
const declarations = "https://unpkg.com/@flop-labs/sdk@0.4.0/dist/x402.d.ts";
const local = "https://github.com/zkasuran/flop-lab/blob/main/packages/x402kit/NOTES.md";

/** Each decision points to a verbatim recorded line or an explicit local policy. @example RULES.proof.quote */
export const RULES = {
  challenge: {
    basis: "SDK documentation",
    source: declarations,
    quote: "Parse x402 payment instructions from a 402 response.",
  },
  price: { basis: "SDK implementation", source: artifact, quote: 'const price = res.headers.get("x-payment-price");' },
  hash: {
    basis: "SDK implementation",
    source: artifact,
    quote: 'const hashLock = res.headers.get("x-payment-hash-lock");',
  },
  timeout: {
    basis: "SDK implementation",
    source: artifact,
    quote: 'const timeout = res.headers.get("x-payment-timeout-blocks");',
  },
  destination: {
    basis: "SDK implementation",
    source: artifact,
    quote: 'const destination = res.headers.get("x-payment-destination");',
  },
  required: {
    basis: "SDK implementation",
    source: artifact,
    quote: "if (!price || !hashLock || !timeout || !destination)",
  },
  asset: {
    basis: "SDK implementation",
    source: artifact,
    quote: 'asset: res.headers.get("x-payment-asset") || "FLOP",',
  },
  network: {
    basis: "SDK implementation",
    source: artifact,
    quote: 'network: res.headers.get("x-payment-network") || "flop-simnet",',
  },
  proof: {
    basis: "SDK implementation",
    source: artifact,
    quote:
      'retryHeaders.set("X-Payment-Proof", JSON.stringify({ hash_lock: payment.hashLock, htlc_id: result.htlcId, tx_hash: result.txHash }));',
  },
  retry: {
    basis: "SDK documentation",
    source: declarations,
    quote: "4. Retries the original request with payment proof attached",
  },
  settlement: { basis: "SDK documentation", source: declarations, quote: "3. Waits for settlement" },
  strict: {
    basis: "Local policy",
    source: local,
    quote: "The checker rejects ambiguous headers and numeric prefixes. This is stricter than the SDK parser.",
  },
  devnet: {
    basis: "Local policy",
    source: local,
    quote: "The reference requires explicit flop-devnet and FLOP labels and X-Payment-Required: true.",
  },
  binding: {
    basis: "Local policy",
    source: local,
    quote: "The reference binds retries to a request ID and rejects changed method, URL, body or application headers.",
  },
  replay: {
    basis: "Local policy",
    source: local,
    quote:
      "A transaction or HTLC cannot pay for another request. An identical completed request may return its cached response.",
  },
  expiry: {
    basis: "Local policy",
    source: local,
    quote: "The reference rejects a proof retry at or after the quote expiry time.",
  },
  capture: {
    basis: "Capture format",
    source: local,
    quote:
      "A transcript needs a source, a capture time and ordered request/response pairs. Missing rounds are not a passing handshake.",
  },
} as const;

export type RuleId = keyof typeof RULES;

/** Omit only transport and payment binding headers. @example bindingHeaders([...request.headers]) */
export function bindingHeaders(headers: [string, string][]): [string, string][] {
  const excluded = new Set([
    "x-payment-proof",
    "x-flop-request-id",
    "host",
    "connection",
    "content-length",
    "user-agent",
    "accept-encoding",
    "sec-fetch-mode",
  ]);
  return headers
    .map(([key, value]): [string, string] => [key.toLowerCase(), value])
    .filter(([key]) => !excluded.has(key))
    .sort(([a], [b]) => a.localeCompare(b));
}
