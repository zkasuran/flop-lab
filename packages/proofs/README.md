# Proof explorer

What proofs are miners submitting and what do they cover? `flop-proofs` reads public PoUI rows, leaderboard reports and settlement pages. It quotes the pinned yellowpaper and explains why the public fields cannot establish paid-channel proof coverage.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/proofs --filter @flop-lab/cli build
node packages/cli/dist/cli.js proofs list
```

The default is a bundled recording. It needs no network call after installation.

## Commands

```sh
node packages/cli/dist/cli.js proofs types
node packages/cli/dist/cli.js proofs coverage --json
node packages/cli/dist/cli.js proofs history
node packages/cli/dist/cli.js proofs history --index ./archive/index.json --json
node packages/cli/dist/cli.js proofs list --live --limit 1000 --save ./proof-observation.json
node packages/cli/dist/cli.js proofs coverage --input ./proof-observation.json --json
```

`--channel 0x...` selects a settlement from the captured sample. A missing match reports no data. Saved files are created exclusively so an existing recording is not overwritten. Invalid CLI arguments exit with an error. Unavailable sources are explicit in the report.

The importable API is `@flop-lab/proofs`:

```ts
import { createCollector, analyzeRecording, recordedProofs } from "@flop-lab/proofs";

const recorded = recordedProofs();
const collect = createCollector();
const current = analyzeRecording(await collect(100));
console.log(recorded.coverage, current.proofs);
```

## What the recording says

The capture ended at `2026-11-06T01:30:07.142Z` through `https://mcp.flop.network/mcp`. It returned zero proof rows, zero leaderboard rows and `proofs24h = 0`. It captured 349 settlement rows with complete reported pagination. Every settlement is `UNVERIFIABLE` for proof coverage. Raw responses, queries and reception times are in `fixtures/capture-*.json`.

The collector recorded 8 HTTP requests in 4646 ms for that run. Those values describe the recorded run on the build host. They are not service performance guarantees.

## Evidence rules

- Section 3.6 separates the direct proof rail for synthetic, ghost, calibration and simulator work from paid compute channels.
- The introspected `PouiProof` exposes `id`, `blockHash`, `blockNumber`, `submitter`, `gnWeight`, `successCount`, `taskHash` and `timestamp`.
- There is no public channel-to-task binding, proof payload, TOPLOC commitment, measured model/output binding or validator signature bundle in that projection.
- Equal miner addresses, blocks, task hashes and channel IDs do not establish coverage. A positive `successCount` does not verify a proof.
- Empty rows mean no observed proof rows. They do not establish that TOPLOC evidence was absent from a settlement.
- Malformed or failed pages make that source unavailable. Duplicate rows, non-advancing pages and changing settlement totals fail closed. A truncated sample stays partial.
- Numeric proof weights come from GraphQL Float fields. They remain reported values and are never used as exact arithmetic or proof coverage.

`types` quotes section 3 and the call references. `submit_stark_batch` and `submit_validator_attestations` are in Appendix G.2. The pinned paper references `submit_toploc_evidence` in Appendix F; it has no standalone signature row in Appendix G.1. The tool does not invent one.

The paper pin is `2a2cc8218048a2933071bb2f45d75335560e39d8`. The sampled-audit parameters are quoted specification defaults, not measurements of deployed runtime storage:

| Parameter                 | Pinned default    |
| ------------------------- | ----------------- |
| `sampled_audit_alpha_ppm` | `50_000 ppm`      |
| `audit_quantum_gn`        | `100_000_000 G_n` |
| `high_value_gn_threshold` | `10_000_000 G_n`  |

## Recorder history

`history` reads the recorder's `stats.proofs24h` and `poui.pouiLeaderboard.count` fields with their own source times. The former is a rolling reported window. The latter is the recorder's bounded leaderboard sample size. Neither is a cumulative proof count. Missing fields remain null. Do not sum overlapping windows or infer daily trends from the close-spaced bundled recorder runs. Use `--index` to inspect a newer local archive index.

## Request bounds and checks

Live reads use `@flop-lab/mcp` with a 500 ms minimum gap, a 15 second attempt timeout and one retry with backoff on 429, 5xx or transport failure. The row limit is 1 to 1000 per paged source. At the maximum limit there are at most 23 logical tool calls with at most two attempts each. Leaderboards are limited to 20 rows. A full proof page at the cap remains partial because the API has no total. Successful or unavailable captures are cached for 60 seconds per collector and limit. Cache hits retain their capture times. Separate CLI processes do not share the cache.

```sh
pnpm --filter @flop-lab/proofs check
FLOP_LIVE=1 pnpm --filter @flop-lab/proofs exec vitest run
```

Tests replay raw public responses and include explicitly synthetic nonempty proof rows matching the observed schema. They exercise hostile inputs, missing fields, pagination, recorder gaps and misleading cross-rail matches. The opt-in network test skips by default. The mutation check labels an unbound proof as covered and confirms the suite rejects it.

## What this does not verify

This tool does not verify cryptographic proofs, signatures, hardware attestation, model execution, answer quality, TOPLOC openings, validator quorum, chain finality or runtime parameter enforcement. It does not establish the absence of channel evidence from an empty direct-rail table. The two leaderboards share indexer infrastructure. Sequential observations are not an atomic chain snapshot. Devnet can reset. No wallet or write transaction is used.
