# Protocol evidence

## Scope and source

This reference implements the legacy HTLC headers used by the shipped
`@flop-labs/sdk` 0.4.0 `x402Fetch`. It is not a standard x402 v2 facilitator.
The raw registry README, JavaScript and declarations are retained as base64 in
`fixtures/`. `sdk-manifest.json` records retrieval times, URLs and SHA-256 hashes.
Base64 preserves source bytes without rewriting upstream prose.

Sources read for this design:

- https://unpkg.com/@flop-labs/sdk@0.4.0/dist/x402.js
- https://unpkg.com/@flop-labs/sdk@0.4.0/dist/x402.d.ts
- https://unpkg.com/@flop-labs/sdk@0.4.0/dist/x402-types/index.d.ts
- https://unpkg.com/@flop-labs/sdk@0.4.0/dist/x402-types/exact-flop.d.ts
- https://unpkg.com/@flop-labs/sdk@0.4.0/README.md
- https://raw.githubusercontent.com/coinbase/x402/main/specs/x402-specification-v2.md
- https://docs.flop.network/docs/agent-integration

The public specification was read on 2026-11-05. It uses a base64
`PAYMENT-REQUIRED` challenge, `PAYMENT-SIGNATURE` authorization and
`PAYMENT-RESPONSE` settlement response. Those are not the legacy SDK headers below.
The SDK also exports a separate `FlopExactAuthorization` encoder with payer,
payee, integer amount, resource and validity fields. This package does not
implement that separate scheme or establish its deployment.

## Actual SDK contract

The README shows `x402Fetch(url, options, paymentParams)` and
`parsePaymentHeaders(headers)`. The shipped declarations and code instead use:

```ts
x402Fetch(client, url, options)
parsePaymentHeaders(response)
```

The SDK parser returns:

```ts
{ asset: string, price: number, hashLock: string,
  timeoutBlocks: number, destination: string, network: string }
```

It requires these response headers:

| Header | SDK behavior |
| --- | --- |
| `X-Payment-Price` | `parseFloat`, denominated in FLOP |
| `X-Payment-Hash-Lock` | removes a leading `0x` |
| `X-Payment-Timeout-Blocks` | `parseInt` |
| `X-Payment-Destination` | copies the string |
| `X-Payment-Asset` | defaults to `FLOP` |
| `X-Payment-Network` | defaults to `flop-simnet` |

The actual retry header is plain JSON, not base64:

```text
X-Payment-Proof: {"hash_lock":"<hex>","htlc_id":"<id>","tx_hash":"<hex>"}
```

The shared `PaymentProof` interface has optional camelCase fields. The executable
helper emits the snake_case fields above. Our fixture test runs the recorded SDK
parser against the recorded local quote.

`x402Fetch` checks for cancellation before creating an HTLC. It passes model
`x402-payment`, the URL as prompt, `rewardFlop`, `timeoutBlocks`, `hashLock` and
optional TEE requirements. It waits for a returned status of `SETTLED` then retries.
It does not pass `destination` to that HTLC call. It does not enforce a per-call
ceiling, absolute quote expiry, expected payee, asset or network. Its floating
parsers accept numeric prefixes. It does not independently prove finality.

## Reference extensions

The reference requires `X-Flop-Request-Id` and emits `X-Flop-Request-Hash`,
`X-Flop-Expires-At` (Unix milliseconds) and `X-Flop-Executable`.
These are local extensions. Stock `x402Fetch` does not enforce them.
The network label `flop-devnet` is a local allowlist, not a claimed CAIP-2 ID.

## Checker rulebook

`src/rules.ts` quotes the retained SDK JavaScript and declarations for each external
rule. Tests compare every quote with the original recorded bytes. The README's
helper signatures differ from those bytes. No undocumented standard x402 v2
requirement is inferred from them.

The following are explicit local policies used by the checker:

- The checker rejects ambiguous headers and numeric prefixes. This is stricter than the SDK parser.
- The reference requires explicit flop-devnet and FLOP labels and X-Payment-Required: true.
- The reference binds retries to a request ID and rejects changed method, URL, body or application headers.
- A transaction or HTLC cannot pay for another request. An identical completed request may return its cached response.
- The reference rejects a proof retry at or after the quote expiry time.
- A transcript needs a source, a capture time and ordered request/response pairs. Missing rounds are not a passing handshake.

`sdk-0.4.0` permits the SDK's missing asset and network defaults. `reference`
requires the local headers above. Both profiles use strict decimal, hash and
header syntax checks. A quote timeout must be an integer from 1 through 7200.
That bound is local policy. Both profiles expect a declared paywalled resource.
A free endpoint returning 200 is reported as the wrong status for that purpose.

Each round stores raw header pairs, status and body plus its capture time. Pairs
retain case and duplicates in pasted transcripts. Fetch-based loopback recordings
contain the header values exposed by Node Fetch, which folds duplicate fields.
The checker cannot recover duplicates that a recorder already discarded.

The checker keeps the first challenge. Another unpaid request for the same binding
is a client deviation, including the SDK class behavior in network issue #89.
Proofs use plain JSON with exactly the three snake_case string fields. Duplicate
JSON keys are rejected before they can be silently replaced. An exact cached
retry is permitted. Transport response dates do not determine cached equality.
The checker compares request fields but does not recompute the server's hash.

`bindRequest` excludes Node's transport-owned `sec-fetch-mode` field. The client
sets the `accept` and `accept-language` defaults before hashing so its binding
matches the actual Node HTTP request. Explicit caller values remain bound.

`serve-mock` is a separate local simulation. Its deterministic mock proof is
publicly forgeable. Its verifier uses a synthetic ledger and its response says
`mock: true`. `X-Flop-Mock: true` marks that route. `X-Flop-Executable: true`
only means the mock callback is configured. The default public-data demo still
fails closed. Neither server sends a chain transaction.

The replay store now claims HTLC IDs as well as transaction hashes. Existing stores
created by older kit versions lack HTLC tombstones for their old entries. Start a
new mock store for this release. This is not a production store migration.

Amounts are decimal FLOP strings converted to 18-decimal integers. The public MCP
client documents those decimals. Exact payment is required. Overpayment is rejected
because refund semantics are not implemented. Timeout blocks and wall-clock expiry
are separate constraints. The quote hash binds method, full URL, body digest and
application headers. Transport headers and proof/request-ID headers are excluded.

## What a server must verify

An independently implemented adapter must read canonical finalized state and prove
the transaction succeeded, the HTLC fully settled, the hash lock matches the quote,
the payee received the exact amount and the transaction/HTLC identifiers agree.
It must distinguish FLOP devnet from other chains. It must supply a block hash,
source and observation time. A typed object or boolean is not a chain proof.

The store must atomically claim a transaction before executing a request. A request
ID with another method, URL, body or application header is rejected. Reusing a
transaction for a second quote is rejected. Completed responses are replayed.
An interrupted claim stays pending until manual reconciliation.

## UNVERIFIED

The legacy SDK evidence does not establish a merchant-bound HTLC settlement path
for arbitrary services. The README requires registered EconomicCritical appraisal
commitments for ordinary HTLC creation. No public paid gateway run, audited chain
adapter, funded receiving account or faucet-backed browser payment was performed.

The demo advertises `X-Flop-Executable: false` and returns
`503 {"error":"chain_adapter_unverified"}` for a syntactically valid proof.
Its quote recipient is an explicit non-address marker. Do not fund it.
The fixture flow is a local Request/Response handler recording. Its settlement
preview comes from the real hosted MCP and is not proof of payment to this service.

The reference generates an opaque random challenge in the hash-lock field. It does
not implement an HTLC preimage lifecycle or redemption. Supplying `readPayment`
enables the synthetic callback contract; it is not sufficient to deploy a working
legacy HTLC merchant. A live integration also needs an audited challenge issuer,
recipient binding, creation and redemption. None of those paths is shipped here.
