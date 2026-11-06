# Pay-per-call evidence page

Does my API speak FLOP's 402 protocol correctly? `/x402` checks pasted exchanges
with the package checker and replays recorded local mock handshakes. Each header
expands to show its value and quoted SDK rule or local-policy label. The SDK class
example exposes the repeated unpaid request reported in network issue #89.

The mock success response is synthetic. The earlier fail-closed Request/Response
fixture remains available below the checker. It marks real payment, confirmation
and the paid response as unverified or unavailable.

The separate settlement preview starts from the dated real MCP recording. The
refresh button reads `/x402/preview`. That endpoint caches successful and failed
reads for 60 seconds, coalesces requests and uses the shared MCP client's backoff.
Malformed or unavailable browser responses keep the last observation and its date.
Empty lists render a no-data message.

## Run

```sh
pnpm install
pnpm --filter web build
pnpm --filter web exec next start --port 3590
```

Open http://localhost:3590/x402. The tool card uses the shared route transition.

Select a recorded example or paste CLI output. The editor accepts the transcript
or its enclosing `exchange` field. Checking does not make a network request.
Invalid input preserves the last checked report and displays an error. Edited input
is marked stale until checked. Empty captures produce an incomplete result.

Motion follows reading order, tracks scroll position, moves the selected flow
step and reorders observed settlement rows. Amount bars scale against the largest
payment in the displayed sample. Exact final values are always visible.
Reduced motion uses immediate states. No payment progress is inferred from motion.
The handshake selection shares a layout marker. Each header disclosure animates
its own content. A direction line traces the selected message and the count bar
shows unpaid requests divided by the recorded request count.

## What this does not verify

The page does not execute or verify payments, generate a wallet, prove finality or
check inference correctness. The preview's escrow sum is arithmetic over observed
fields. The local recording is not a completed devnet payment. No live payment
adapter is configured. The checker does not authenticate pasted source metadata,
recompute the server's request hash or prove exactly-once handler execution.
