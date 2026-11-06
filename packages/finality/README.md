# Finality

Is the chain producing and finalizing blocks on time? `flop finality` measures intervals between linked consecutive blocks and compares the public API's reported finalized lag with pinned yellowpaper rules. Missing finality stays unavailable.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install
pnpm --filter @flop-lab/finality build
node packages/finality/dist/cli.js snapshot --recorded
```

## Read or record

```sh
node packages/finality/dist/cli.js snapshot --json
node packages/cli/dist/cli.js finality snapshot --recorded
node packages/finality/dist/cli.js snapshot --out finality.json
node packages/finality/dist/cli.js snapshot --input finality.json --json
```

Build the suite CLI before using its command. `--out` creates a replayable JSON file and refuses to overwrite it. It never writes a transaction. Exit codes: 0 for a normal lag comparison with timing data, 1 for a warn/freeze/escape result and 2 for missing data, parameter drift or invalid input.

## How the measurements work

One `flop_indexer_query` requests the latest block window and `stats.finality` through `@flop-lab/mcp`. A window is capped at 24 blocks. Calls use an eight-second attempt timeout and one retry with backoff on retryable errors. No discovery loop or RPC host scan runs during a snapshot. `createMonitor()` coalesces callers and caches successes and failures for 15 seconds after completion.

Every recording retains the raw tool text, query, source URL, response time, duration and request count. Sort blocks by height. Only adjacent heights with matching parent hashes and increasing non-future millisecond timestamps contribute an interval. Missing heights are not averaged away. Median is the middle value or the mean of the middle pair. Nulls, duplicates and malformed fields never become zero. The count above the paper's 1000 ms interval is descriptive, not a consensus violation verdict.

Finality lag is `bestBlock - finalizedBlock` within the reported finality object. It must equal `finalizedLag`. The indexed strip can trail that object's best head. The strip is never substituted into that formula. No conversion of lag into elapsed stall time is made.

## Quoted rules

Source: [yellowpaper at 2a2cc821](https://github.com/flop-labs/yellowpaper/blob/2a2cc8218048a2933071bb2f45d75335560e39d8/yellowpaper.md). Raw excerpts and their line numbers are in `test/fixtures/paper.json`.

- R2.1: "Blocks **MUST** be authored by BABE at a fixed **1 s** interval."
- `finality_lag_warn`: 30 blocks. "Finality lag above which the detector reports Lagging (alert only; finality-clocked deadlines pause naturally)." The comparison is strictly greater than 30.
- `finality_freeze_threshold`: 120 blocks. "Finality lag at/above which the channel enters Stalled: new finality-dependent opens are rejected fail-closed (ensure_finality_open_allowed); additive top-up/cancel paths stay open."
- `max_finality_stall`: 3600 blocks. "Finality lag at/above which the chain is EscapeEligible (safe mode): restore AlephBFT finality or ratify a checkpoint recovery through the hard-fork runbook."

These are pinned paper values. API-reported thresholds are compared separately. Neither agreement nor an API state label proves deployed runtime enforcement. Section 2 specifies no finality latency target. Escape eligibility never authorizes treating best blocks as finalized.

## Validators and rotation

The captured tool list and indexer schema expose no active validator membership, session keys, committee identities or rotation events. `activeOperators`, price-source miners and trust-root committee entries are not substitutes for the validator set.

Section 15 distinguishes the authoring set from the selected finality committee. Registration enters `ValidatorQueue`; rotation promotes into `ActiveValidators`. Section 15.5 describes interval-based and manual rotation with a stake gate, churn cap and minimum active-set guard. This tool quotes the rule but cannot observe its execution from the inspected public fields. The site links the recorder's dated height history. Sparse recorder points are not consecutive-block timing measurements.

## Library and checks

```ts
import { collect, analyzeRecording } from "@flop-lab/finality";
const report = analyzeRecording(await collect());
console.log(report.production, report.lagState);
```

Run `pnpm --filter @flop-lab/finality check`. The default tests replay real responses and make no network calls. `pnpm --filter @flop-lab/finality capture` deliberately refreshes the small research fixtures through public read-only sources. Tests cover threshold boundaries, gaps, parent mismatches, malformed heads, offline cache behavior and empty input.

## What this does not verify

The tool does not verify AlephBFT signatures, finalized-prefix storage, canonical chain membership, validator identities, rotation execution, deployed thresholds or runtime safe mode. MCP block lookup and indexer queries share an indexer and are not independent proofs. A normal reported lag is not an uptime or finality guarantee. The devnet can reset. Dated recordings are not current network state. The recorder archive does not contain a finalized-head series yet. No latency SLA or stall duration is inferred from block lag.
