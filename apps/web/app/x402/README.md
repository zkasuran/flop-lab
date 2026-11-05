# Pay-per-call evidence page

`/x402` replays the local Request/Response fixture from `packages/x402kit`. It shows
the actual SDK headers and the configured example quote. It marks payment,
confirmation and the paid response as unverified or unavailable.

The separate settlement preview starts from the dated real MCP recording. The
refresh button reads `/x402/preview`. That endpoint caches successful and failed
reads for 60 seconds, coalesces requests and uses the shared MCP client's backoff.
Malformed or unavailable browser responses keep the last observation and its date.
Empty lists render a no-data message.

## Run

```sh
pnpm install
pnpm --filter web build
pnpm --filter web exec next start --port 3350
```

Open http://localhost:3350/x402. The tool card uses the shared route transition.

Motion follows reading order, tracks scroll position, moves the selected flow
step and reorders observed settlement rows. Amount bars scale against the largest
payment in the displayed sample. Exact final values are always visible.
Reduced motion uses immediate states. No payment progress is inferred from motion.

## What this does not verify

The page does not execute or verify payments, generate a wallet, prove finality or
check inference correctness. The preview's escrow sum is arithmetic over observed
fields. The local recording is not a completed devnet payment. No live payment
adapter is configured.
