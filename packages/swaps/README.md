# Swap planner

Is this atomic swap safe to start? This tool checks declared HTLC timing against pinned yellowpaper rules. It shows the required FLOP duration and explains each failed or unknown condition. A passing plan means the supplied timing assumptions meet those rules.

## Quick start

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/cli... build
node packages/cli/dist/cli.js swap observe --recorded
```

## Plan a swap

```sh
node packages/cli/dist/cli.js swap plan --flop-blocks 7200 --other-blocks 6 --other-block-ms 600000 --lag 0 --refund-head finalized --counter-refund-first
```

This is a synthetic example. Durations are **remaining blocks from the same planning instant**, not absolute block heights. The supported direction is counter-chain reveal to FLOP relay. `--flop-block-ms` defaults to the paper's one-second clock. A different interval produces UNKNOWN because an observed average interval does not replace the protocol clock. Intervals use whole milliseconds. Fractional foreign seconds round up before the percentage margin rounds up.

The pinned rule is:

```text
other = ceil(otherBlocks * otherBlockMs / 1000)
margin = max(ceil(other * percent / 100), maxFinalityStall + currentFinalityLag)
requiredFlopBlocks = other + margin
```

Equality passes. Lag at or above the freeze threshold fails even with excess duration. A missing `--lag` yields UNKNOWN. `--refund-head finalized` declares the R10.3 refund gate. `--counter-refund-first` declares the counter-chain ordering assumption in section 10.2. These flags are scenario inputs, not observations or proof.

The [pinned paper](https://github.com/flop-labs/yellowpaper/blob/2a2cc8218048a2933071bb2f45d75335560e39d8/yellowpaper.md#10-htlc-atomic-swap) supplies the percentage margin, finality stall, freeze threshold, BTC interval and zero burn-share parameters. Their exact recorded rows and capture time are in `fixtures/paper.json`. These are documented defaults. No deployed runtime parameters are read. The [atomic-swaps guide](https://docs.flop.network/docs/atomic-swaps) describes the general flow and marks its status as draft.

## Local hash locks

```sh
node packages/cli/dist/cli.js swap generate
node packages/cli/dist/cli.js swap check --hash-lock 0000000000000000000000000000000000000000000000000000000000000000
```

Generation uses local Web Crypto randomness and SHA-256 over the raw preimage bytes. The output includes the preimage. Keep that output private. The tool never calls `flop_generate_secrets`. The checker accepts only a hash lock and sends only `hash_lock` to `flop_check_htlc`. It never accepts a preimage argument.

The recorded checker response says `HTLC not found or RPC unavailable.` This is UNKNOWN, not proof of absence. A positive checker schema has not been observed. Unrecognized responses keep their raw evidence and also return UNKNOWN.

## Observe the devnet

`node packages/cli/dist/cli.js swap observe` reads the first FLOP_BTC open-order page and the first HTLC page. The two surfaces are distinct. An HTLC can fund a different operation and is not evidence of a paired cross-chain swap. Nonempty order rows remain unqualified raw objects because the recorded order list is empty.

Each observation includes the source, tool, request arguments, raw response and receipt time. Failures are null data with an error, never zero. Live reads use the shared MCP client, spaced requests and one retry with backoff on retryable failures. Successful reads have an explicit in-memory TTL of 30 seconds. Concurrent identical reads share a request. The cache is bounded to 64 entries. Each `observe` call needs two requests before retries on a cold instance. No background polling occurs.

`--recorded` runs offline. `fixtures/synthetic.json` contains invented timing examples labelled synthetic. Other fixtures contain dated public response bytes or selected paper text. Run `pnpm --filter @flop-lab/swaps record` to intentionally refresh those recordings.

## Library

```ts
import { planSwap, generateHashLock, SwapReader } from "@flop-lab/swaps";

const plan = planSwap({
  flopBlocks: "7200", otherBlocks: "6",
  flopBlockMs: "1000", otherBlockMs: "600000",
  currentFinalityLag: "0", refundHead: "finalized",
  counterRefundBeforeLateClaim: true,
});
const local = await generateHashLock();
const observation = await new SwapReader().check(local.hashLock);
```

Unsigned integer strings keep timing arithmetic exact beyond JavaScript's safe integer range. Invalid inputs throw. The CLI prints JSON. Exit codes: 0 for a passing plan or successful observation, 1 for a failed plan or unavailable read and 2 for invalid input or an unknown plan.

## Checks

`pnpm --filter @flop-lab/swaps check` runs types, lint, formatting and tests. The tests replay raw public responses and cover rounding, equality, freeze boundaries, ordering, empty data, malformed data, cache expiry and local hashing. Set `FLOP_LIVE=1` to enable the bounded live smoke test. Offline service failures leave that smoke test without an assertion about the network.

## What this does not verify

This does not create, redeem or refund an HTLC. It does not verify finalized chain storage, runtime admission, counter-chain inclusion, terminal ordering, recipient binding, preimage availability, relayer permissions or transaction fees. It does not turn an indexed CREATED row into a currently redeemable contract. The paper makes no deployed chain-pair completion guarantee. Timeout enables refund; it does not by itself extinguish a hash-lock claim. The zero burn-share parameter does not establish an incentive or fee-floor guarantee.
