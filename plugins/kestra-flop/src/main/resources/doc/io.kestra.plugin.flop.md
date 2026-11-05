# FLOP flows

Use `network.Stats` for dated counters, `models.List` for gateway sources and
`settlements.List` followed by `settlements.Verify` for an arithmetic check.
Every network output records receipt time, endpoint and HTTP attempt count.
The icon is a neutral list symbol. It is not the FLOP logo.

`settlements.List` accepts miner, agent, model, sku and tier filters. It reads
bounded pages and exposes `truncated`. `store: true` writes the same rows to ION.
An empty verification reports `NO_DATA`. It is not a passing check.

`settlements.NewSettlement` records the first observed block without replay.
It watches newer blocks and unseen event keys at that block. The cursor moves
after execution creation. Creation failures leave the cursor in place.
Deduplicate downstream. The cursor write and scheduler handoff are not atomic.
Backfills below the cursor are not detected. A reset or insufficient poll bound
fails visibly with the cursor retained. Rate limits and server outages skip a poll.

`inference.ChatCompletion` is not run against the live gateway. Store `apiKey`
with Kestra secrets. Set `maxPricePerGflop` and `maxCostFlop` as decimal strings.
Only an explicit `price_per_gflop` with `price_unit: FLOP/GFLOP` on a fresh
source can pass the discovery check. This optional extension is mock-tested.
The observed devnet-nominal feed has no such quote, so chat is refused.
Token pricing is not GFLOP pricing. Paid requests are never retried by this client.
An ambiguous timeout can still represent accepted work. Avoid task-level retries
for paid chat unless the previous outcome has been reconciled.

Read calls retry network errors, HTTP 429 and HTTP 5xx with bounded backoff.
The per-client minimum gap is 250 ms. There are at most three attempts.
Retry-After beyond 30 seconds stops retries instead of shortening the server delay.
Stats and model caching have a per-client TTL of 10 seconds. Settlements and
pre-chat discovery are uncached. Separate tasks create separate clients.

## What this does not verify

The plugin does not verify inference, signatures, proofs, chain inclusion or
finality. Arithmetic checks cover only supplied rows. Discovery prices are not
a promise about miner routing or settlement cost. Gateway cost enforcement and
live chat remain unverified.
