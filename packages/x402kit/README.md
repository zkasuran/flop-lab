# FLOP pay-per-call kit

Inspect the FLOP SDK's payment headers. Build request-bound payment handling with a
hard client ceiling and a replay store. Run a dated settlement preview from the
hosted MCP.

**Payment execution is UNVERIFIED.** The reference demo fails closed. The shipped
SDK does not establish recipient binding for an arbitrary merchant in the HTLC
helper. See [NOTES.md](NOTES.md) for the exact code and protocol differences.

## Run

From the repository root with Node 22 and pnpm:

```sh
pnpm install
pnpm --filter @flop-lab/x402kit check
pnpm --filter @flop-lab/x402kit build
node packages/x402kit/dist/cli.js --help
node packages/x402kit/dist/cli.js inspect packages/x402kit/fixtures/headers.json
node packages/x402kit/dist/cli.js serve 3350
```

In another terminal:

```sh
curl http://127.0.0.1:3350/preview
curl -i -H 'X-Flop-Request-Id: example-request-0001' http://127.0.0.1:3350/settlements
```

`/preview` returns compact settlement rows with exact escrow arithmetic. It retains
the source and observation time. It caches success and unavailable results for
60 seconds and coalesces concurrent requests. MCP calls use the shared client with
one retry, backoff on 429 and server errors and request spacing. Empty lists remain
empty. `/settlements` emits a quote but cannot release data for a payment proof.
Prices in quotes are configured examples, not observed network prices.

The [template folder](create-flop-x402/) runs inside this checkout after installation
and building the package. `pnpm dev` starts the same Hono reference service.

## Importable API

```ts
import { paywall, payAndFetch, FileStore } from "@flop-lab/x402kit";

const wall = paywall({
  priceFlop: "0.01",
  payTo: "UNVERIFIED-NO-RECEIVING-ACCOUNT",
  ttl: 60_000,
  store: new FileStore("./payments.json"),
});
// No readPayment adapter: every proof fails closed.
const response = await wall(request, () => Response.json({ result: "protected" }));

// The caller must supply an independently audited throwaway-devnet payment adapter.
await payAndFetch(request, {
  maxFlop: "0.01",
  expectedPayTo: receivingAddress,
  authorize: async (quote) => policy.authorize(quote),
  pay: auditedDevnetPaymentAdapter,
});
```

`honoPaywall(options)` wraps the same handler. `authorize(quote)` must explicitly
return true. It can adapt a spendguard policy without a package dependency. The
quote is frozen. Expiry and cancellation are checked again after authorization.
Redirects are refused. Only one payment callback and one proof retry can occur in
one `payAndFetch` invocation. A retry failure requires reconciliation using the
existing proof. Calling the helper again without that reconciliation can pay again.
The ceiling covers the quoted FLOP amount. It does not cover chain fees.

The server's `readPayment(proof)` callback is a trust boundary. It returns:

```ts
{ network: "flop-devnet", asset: "FLOP", status: "SETTLED",
  finalized: true, canonical: true, hashLock, htlcId, txHash,
  amountFlop: "0.01", payTo, blockHash, source, observedAt }
```

Every field must come from independent canonical chain observations. Never construct
this object from client headers. `verifyObservedPayment` validates the object and
its agreement with the stored quote. It does not read the chain itself.

## Threat model

The middleware rejects malformed proofs, changed requests, exact-amount mismatches,
wrong payees, expired quotes, partial/unfinalized observations and reused transaction
hashes. Tests use synthetic payment evidence and recorded real MCP responses.

The request ID is an unguessable bearer capability. Use TLS and keep it out of logs.
A leaked ID and proof can retrieve the cached result. This is not payer authentication.
Transport headers excluded from request binding are listed in `bindRequest`.

`MemoryStore` lasts only for the process lifetime. `FileStore` uses an exclusive
directory lock, flushed writes, atomic rename and directory fsync on local Linux
storage. Multiple workers must use the same store file. A stale lock is never stolen.
Stop all writers and reconcile pending payments before removing one. Network filesystems
and hostile filesystem writers are outside this contract.

Claims are persisted before the handler. Same-process concurrent duplicates share
the result. Competing processes can return `409 payment_pending_reconciliation`.
Retry the same proof after the first request completes. Handler errors are cached.
A crash between the claim and response needs manual reconciliation. Exactly-once
external side effects are not promised. There is no automatic refund.

Request bodies are limited to 64 KiB and responses to 1 MiB. Stores admit at most
10,000 quotes and do not evict replay tombstones. Add service-level rate limits and
authenticate callers before exposing a paid adapter. This reference does not provide
distributed storage, retention compaction or denial-of-service protection.

## Checks and evidence

`pnpm --filter @flop-lab/x402kit record` refreshes the raw SDK evidence, MCP fixture
and local handler flow. Fixtures keep source URLs and UTC timestamps. Unit tests
are offline. `FLOP_LIVE=1` enables the optional read-only smoke check.

Failure matrix assertions cover underpayment, overpayment, wrong payee, expiry,
replay, changed path/method, partial settlement, reorg, missing finality, concurrent
duplicates and malformed headers. These tests do not simulate a real chain payment.

## What this does not verify

This kit does not verify real merchant settlement, runtime finality, TEE appraisal,
inference correctness or standard x402 v2 interoperability. It has no live payment
adapter and creates no wallet. The site shows a recorded local flow and dated MCP
observations. Payment and confirmation steps remain UNVERIFIED.
