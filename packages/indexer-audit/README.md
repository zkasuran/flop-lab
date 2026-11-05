# Indexer audit

Does the FLOP indexer agree with itself? Run a bounded audit of its blocks, totals and settlement accounting. Each check returns PASS, FAIL or UNVERIFIABLE with its formula and dated inputs. FAIL means that a declared consistency rule did not hold. It does not prove a chain fault.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install --no-frozen-lockfile
pnpm --filter @flop-lab/indexer-audit build
node packages/indexer-audit/dist/cli.js run --limit 3
```

The suite command is `flop indexer run --limit 3` after building `@flop-lab/cli`. `--json` includes the raw responses for replay. A detected failure exits with code 1. Invalid input or no usable result exits with code 2. Otherwise the exit code is 0; inspect UNVERIFIABLE checks separately.

```sh
node packages/indexer-audit/dist/cli.js run --json --limit 3 > audit.json
node packages/indexer-audit/dist/cli.js run --snapshot audit.json
node packages/indexer-audit/dist/cli.js run --snapshot packages/indexer-audit/fixtures/devnet.json
```

## Importable API

```ts
import { createAuditor, auditSnapshot } from "@flop-lab/indexer-audit";

const auditor = createAuditor();
const report = await auditor.run({ limit: 20 });
const replay = auditSnapshot(report.snapshot);
console.log(replay.counts);
```

`auditSnapshot` validates the envelope and the fields consumed by each check. Bad fields make affected checks UNVERIFIABLE. Malformed envelopes throw. Amounts stay as decimal strings and use BigInt arithmetic. No monetary value passes through a JavaScript number.

## Rules and sources

The GraphQL schema was introspected through `flop_indexer_query`. The explorer's public client exposed `/api/stats`, `/api/staking/stats` and `/api/miners`. Read-only GET requests collect those endpoints. MCP calls use `@flop-lab/mcp`.

| Check | Definition | Source and limit |
| --- | --- | --- |
| Blocks | Consecutive heights and linked parent hashes. Same-number MCP lookup returns the same hash. | GraphQL `blocks` is documented as newest first. `flop_get_block` also reads the indexer. |
| Counters | The second height, block count, transaction count and account count do not decrease. | GraphQL `Stats`. A decrease can also reflect a reset or reorg. The observation window is short. |
| Peer stats | Transaction totals agree only at the same observed height. | `flop_get_stats`, GraphQL and `/api/stats`. Different heights are UNVERIFIABLE. |
| Finality | `finalizedLag = bestBlock - finalizedBlock`. | `/api/stats.finality` supplies all three fields. This is reported lag, not a finality proof. |
| Stake components | `totalStake = selfStake + delegatedStake + sponsoredStake`. Excludes unbonding. | `/api/staking/stats`. This is the audit's explicit all-bonded-parts definition. A failure can be a label/definition disagreement. |
| Miner sums | Each aggregate component equals the sum of that component across every miner row. | `/api/staking/stats` and `/api/miners`. Incomplete pages and duplicate keys are UNVERIFIABLE. Observations are sequential and lack a shared finalized hash. |
| Runtime stake | TotalStake includes self-stake at one finalized hash. | [Existing report #75](https://github.com/flop-labs/network/issues/75). Current public projections lack that storage proof. |
| Calibration phase | Active only before acceptance block plus CalibrationLeaseBlocks. | [Existing report #76](https://github.com/flop-labs/network/issues/76). Current miner responses omit acceptance and expiry blocks. |
| Supply | Total supply equals all free and reserved balances at one finalized hash. | `/api/stats.totalSupply`. A bounded top-holder sample cannot establish this sum. |
| Inference totals | Complete same-window paid equals received plus burned. | GraphQL descriptions distinguish terminal-recognized receipts from legacy unbounded lifecycle spend. A partial page is UNVERIFIABLE. |
| Settlement | `escrow = minerPaid + burned + unusedEscrow`. | [Session lifecycle](https://docs.flop.network/docs/inference-session-lifecycle) and the observed settlement fields. Residual arithmetic is not proof of a refund. |
| Channel projection | Settlement and channel agree on escrow, paid, burned and G_n at the same settlement block hash. | GraphQL settlement tape and `flop_get_compute_channel`. Different revisions are UNVERIFIABLE. |
| Realized unit price | `price = minerPaid / aggregateGn` within one unit of the last printed decimal place. | Declared unit-price definition over observed tape fields. Checked against the matching channel. Zero compute is UNVERIFIABLE. This is raw planck per reported G_n, not FLOP per GFLOP. |
| Leaderboard | Unique submitters in nonincreasing weight order. Ties are allowed. | GraphQL description: "Top PoUI miners by accumulated G_n weight". Fewer than two rows cannot establish ordering. |

Every finding carries its formula, source reference and observation ids. A PASS covers only that rule over the sample. A missing field never becomes zero.

## Request limits and caching

`--limit` accepts 1 to 100 and defaults to 20. It limits rows per list and channel lookups. A run makes at most `limit + 7` logical calls and `2 * (limit + 7)` HTTP attempts. Retries count toward that bound. There is no pagination loop.

The collector spaces requests by at least 250 ms. MCP retries once with backoff. Explorer GETs retry once on 429 and 5xx and honor numeric Retry-After up to 30 seconds. A request has a 12-second deadline including its body and a 200,000-byte body cap. Redirects are rejected.

Successful observations are cached for 30 seconds per auditor instance and limit. Failures are not cached. The cached report keeps its original dates and `cached: true`. Each CLI process starts fresh. An explicit snapshot is always offline and keeps its original dates.

## Tests and recorded evidence

```sh
pnpm --filter @flop-lab/indexer-audit check
pnpm exec tsx packages/indexer-audit/scripts/record.ts
FLOP_LIVE=1 pnpm --filter @flop-lab/indexer-audit exec vitest run
```

The recorded fixture includes the raw responses, requests and receipt times. Tests replay it and inject one-planck errors, mismatched hashes, malformed amounts, empty data, missing inputs, duplicate rows and reversed ranks. Live tests are opt-in and skip if every endpoint is unavailable. The recording command replaces the fixture only when explicitly run.

At `2026-11-05T23:12:20.949Z`, the recorded run made 10 HTTP requests in 4,496 ms with a row limit of 3. It found 19 PASS, 1 FAIL and 8 UNVERIFIABLE checks. The miner stake total was `3260130000000000000000000` raw planck. The sum of its self, delegated and sponsored fields was `63427153000000000000000000`. The check uses the all-bonded-parts definition above. It does not establish which runtime storage item the endpoint reads.

A second live run completed at `2026-11-05T23:16:38.404Z` with a row limit of 100. It made 107 requests in 30,181 ms. Its complete miner component sums passed and the same stake-total definition check failed. A separate cold Node CLI process replayed the small fixture in 29.521 ms on the build host. These are observations from those runs, not performance guarantees.

## Browser board

Open `/indexer` on the suite site to inspect the bundled recording. Filters keep FAIL, PASS and UNVERIFIABLE separate. Expand a row for both values, source dates, raw responses and its equation. Download the snapshot and pass it to `run --snapshot` to replay the same evidence. The page does not call FLOP services and does not label the recording as current data.

## What this does not verify

This tool does not independently read node storage or verify chain proofs, signatures, inference or settlement execution. MCP and explorer can share a backend. Matching projections are not independent confirmation. It cannot reverify #75 or #76 from the current public fields and does not claim they are fixed. It does not enumerate all accounts or participants, infer missing balances, prove refunds from residuals or compare legacy spend with terminal receipts. Sequential samples can span head changes. Devnet can reset.
