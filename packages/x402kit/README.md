# FLOP pay-per-call kit

Does my paywalled API speak FLOP's 402 protocol correctly, from both sides? Check a
recorded exchange or a local server against quoted SDK rules. Run a mock client
and server to inspect the full handshake. The kit also provides request-bound
payment handling with a client ceiling and replay store.

## Quick start

From the repository root with Node 22 and pnpm. This inspects recorded payment
handshake without sending a payment:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/x402kit build
node packages/x402kit/dist/cli.js check packages/x402kit/fixtures/handshake.json
```

## Payment boundary

**Payment execution is UNVERIFIED.** The reference demo fails closed. The shipped
SDK does not establish recipient binding for an arbitrary merchant in the HTLC
helper. See [NOTES.md](NOTES.md) for the exact code and protocol differences.

## Run

### Mock handshake and checker

After the quick start, run the server:

```sh
node packages/x402kit/dist/cli.js serve-mock 3590
```

In another terminal:

```sh
node packages/x402kit/dist/cli.js client http://127.0.0.1:3590/paid
node packages/x402kit/dist/cli.js check http://127.0.0.1:3590/paid
```

The client prints the captured exchange, counts and checker report. Its token is
a deterministic mock value, not a payment. The server releases a labelled mock
response. The check command sends one unpaid probe, so its paid-half coverage
is incomplete and it exits 3. Use a captured full exchange to check both sides.
Redirects are refused. Local requests have a five-second total deadline. Failed
probes and proof retries are never repeated automatically. Capture bodies are
bounded at 64 KiB. This local diagnostic does not poll shared public services.

`flop x402` forwards these same commands after building the umbrella CLI.
The checker accepts the transcript itself or the client output's `exchange` field.
Headers are arrays of `[name, value]` pairs, preserving duplicates for diagnosis.
See `fixtures/handshake.json` for the capture schema. Input is bounded at 128 KiB,
16 rounds and 64 headers per message. Empty and partial captures stay incomplete.

Exit codes: 0 means no deviations among the checked rules, 1 means invalid input
or a client failure, 2 means deviations and 3 means incomplete coverage. Findings
identify the round, client or server, code, quoted rule and source. A failed paid
response stays incomplete unless a supported rule identifies a deviation.

The `sdk-0.4.0` profile checks the legacy SDK flow with strict syntax. The
`reference` profile also requires local request binding and devnet headers.
Stricter local rules are labelled in [NOTES.md](NOTES.md) and `src/rules.ts`.
The pinned SDK class recording reproduces the repeated unpaid request in
[network #89](https://github.com/flop-labs/network/issues/89). The refusal response
is scripted. It is not evidence of a live gateway incident or double payment.

### Read-only settlement demo

From the repository root with Node 22 and pnpm:

```sh
pnpm install
pnpm --filter @flop-lab/x402kit check
pnpm --filter @flop-lab/x402kit build
node packages/x402kit/dist/cli.js --help
node packages/x402kit/dist/cli.js inspect packages/x402kit/fixtures/headers.json
node packages/x402kit/dist/cli.js serve 3590
```

In another terminal:

```sh
curl http://127.0.0.1:3590/preview
curl -i -H 'X-Flop-Request-Id: example-request-0001' http://127.0.0.1:3590/settlements
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
import { checkExchange, runMockClient } from "@flop-lab/x402kit";

const report = checkExchange(recordedExchange);
const local = await runMockClient("http://127.0.0.1:3590/paid");
```

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

The quote's random hash-lock field is a reference challenge. This package has no
HTLC preimage lifecycle or redemption path. Adding `readPayment` alone does not
make a working merchant. The executable flag indicates that the callback contract
was supplied, not that live payment support has been established.

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

`pnpm exec tsx packages/x402kit/test/record-handshake.ts` captures a real loopback
exchange on port 3592 plus the pinned SDK's standalone and class flows against a
scripted transport. Fixture dates are capture times, not current quote validity.
The checker compares expiry with the recorded round time. The fuzz corpus exercises
malformed challenge headers before the client callback and malformed proofs before
server release. A real HTTP test covers transport-added headers.

## What this does not verify

This kit does not verify real merchant settlement, runtime finality, TEE appraisal,
inference correctness or standard x402 v2 interoperability. It has no live payment
adapter and creates no wallet. Mock ledger fields and mock success responses are
synthetic. The checker does not authenticate captures, recompute the server's
request hash, prove exactly-once execution or test every possible SDK extension.
Old replay stores need reconciliation of missing HTLC tombstones. The site shows
recorded local flows and dated MCP observations. Real payment and confirmation
remain UNVERIFIED.
