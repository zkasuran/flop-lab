# Session lifecycle

Where is a compute channel in its lifecycle? Inspect open channels, forced claims, cooperative payouts and refunds with the fields that establish each state. The tool joins computeChannels with the settlement tape and keeps their observation times.

## Quick start

From the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/sessions build
node packages/sessions/dist/cli.js list --state challenge-window --replay packages/sessions/test/fixtures/live
```

## Inspect a channel

```sh
flop-sessions list --state open
flop-sessions show 0xd7ed98cb7e504d8c1f3dd9a95eb4461b3fad43d2bc423e4dcf94e06febd7f55f
flop sessions list --max-pages 1 --json
```

Build the workspace before using the suite binary: `pnpm -r --if-present run build`. The source API is available as `@flop-lab/sessions`.

```ts
import { collectSessions, classifyCapture } from "@flop-lab/sessions";

const recording = await collectSessions({ maxPages: 20 });
const report = classifyCapture(recording);
console.log(report.counts, report.channels, report.settlements);
```

`list` and `show` read public data by default. `--replay DIR` reads only local evidence. `--record DIR` saves original tool text in separate bounded pages to a new directory. It refuses to overwrite existing files. JSON output includes counts, coverage, source fields and classification reasons. `show` searches the bounded observation, so a missing result does not prove the channel never existed. Exit codes: 0 for an observation, 1 for invalid input, 2 for a channel absent from the observation and 3 when both channel and settlement sources are unavailable.

## States and quoted transitions

The transition catalogue is exported as `transitions` in `src/lifecycle.ts`. Each edge has a verbatim quote and source link. The source recording retains the complete lifecycle docs, direct-session docs and section 12 excerpt from yellowpaper commit `2a2cc8218048a2933071bb2f45d75335560e39d8`.

| State filter | Evidence required |
| --- | --- |
| `opening` | Indexer `PendingAck` status |
| `open` | Indexer `open`; off-chain usage is unobserved |
| `cooperative` | `settled` plus `cooperative=true`; tape event must be `computeChannel.Settled` when present |
| `challenge-window` | `settling` with a final root and challenge-end block, a forced-settlement status or explicit `ForceSettled` event |
| `disputed` | Explicit `disputed` status |
| `finalized` | Explicit finalisation status or `computeChannel.Finalized` event |
| `refunded` | Explicit refund, timeout, expiry or void status |
| `unknown` | Unsupported status, contradictory evidence or missing settlement-path evidence |

Quoted rules include:

- Offer selection: "`auto` uses a live signed spot offer for this miner and model, then falls back to `force_open` when none is available." [Direct-session docs](https://docs.flop.network/docs/send-to-specific-miner).
- Usage: "The inference stream remains off-chain". [Yellowpaper section 12](https://github.com/flop-labs/yellowpaper/blob/2a2cc8218048a2933071bb2f45d75335560e39d8/yellowpaper.md).
- Cooperative payout: "The current cooperative path pays private escrow immediately and issues no public work credit (R11.2b)." Same pinned section.
- Forced close: "A forced settlement posts a claim; it still needs permissionless `finalize` after its challenge window." Direct-session docs.

The classifier never adds a fixed wall-clock window. It never treats an elapsed challenge-end block as proof of finalisation. A cooperative payout stays separate from the forced claim lane. Offers are counted separately because the public offer list does not establish an offer-to-channel link. A duplicate ID becomes unresolved evidence. Changing totals or non-contiguous pages mark coverage incomplete.

## History

`flop-sessions history <recorder-snapshot.json> --json` validates a recorder snapshot and its content digest. It counts the distinct channels in that run's settlement sample. The recorder does not capture computeChannels, so this is settlement-sample history only. Missing sources remain gaps. Differences between samples do not prove lifecycle transitions or network-wide trends.

## Collection limits

The shared MCP client is the only transport. Each source page requests 50 rows. The default ceiling is 20 pages for channels and 20 for settlements plus one offer page. Requests are spaced by 300 ms. Each attempt times out after 10 seconds and has at most one retry for retryable network, 429 or 5xx failures with backoff. A failed source stops. There is no polling loop. Each raw page is capped below 200 KB.

CLI invocations use fresh reads. `cachedCollector` supplies an explicit 60-second per-process TTL for embedding applications and coalesces concurrent reads. No cross-process cache is implied.

The committed run finished at `2026-11-06T00:15:58.500Z` through `https://mcp.flop.network/mcp`. It read 624 channel rows and 347 settlement rows using 21 HTTP requests in 6082 ms. These are local collection measurements. They are not service latency guarantees. The manifest and raw pages are under `test/fixtures/live`.

## Checks

`pnpm --filter @flop-lab/sessions check` runs strict types, lint, format checks and fixture-backed tests. Tests cover duplicate pages, contradictory states, invalid data, outages, partial populations, deadlines and missing observations. Synthetic states are labelled in the tests. Set `FLOP_LIVE=1` to enable the bounded optional live smoke check.

## What this does not verify

This tool classifies indexer reports. It does not verify chain finality, signed receipts, transcript inclusion, inference correctness, hardware attestation, challenge standing or payout amounts. The indexer's `observationHead=finalized` is a source claim. It is not a storage proof.

The source views share infrastructure and are read sequentially. Complete pagination is not an atomic chain snapshot. Devnet can reset. Status names outside the supported set remain unresolved. Opening, dispute and finalisation branches have synthetic coverage where the recorded devnet sample has no such rows. Off-chain usage and complete historical channel state are unavailable. No wallet, transaction or paid inference request is used.
