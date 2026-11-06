# FLOP challenger

Is a settlement worth review and is its challenge window still open? Challenger ranks payouts and watches forced claims by their indexed end block. Each dossier carries verifier v2 checks, raw evidence and a content hash for offline replay. It never submits a dispute.

## Quick start

From the repository root with Node 22 and pnpm. This reads a recorded tape without a wallet or API key:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/challenger build
node packages/challenger/dist/cli.js windows --recorded
```

## Read current data

```sh
node packages/challenger/dist/cli.js watch --limit 5
node packages/challenger/dist/cli.js watch --sort priority --json
node packages/challenger/dist/cli.js windows --json
```

The binary is `flop-challenger`. The direct Node command works from a checkout without a global install.

This private workspace package imports the shared MCP and verifier source directly, matching the existing package layout. The suite also exposes `flop challenger`. No second MCP client is implemented.

Build a dossier for the channel in the recorded sample:

```sh
node packages/challenger/dist/cli.js dossier 0xa5d0a1722a5c7b8b86d7489ff1e76d0c3eb0a72e39e9c47edee1681ef766deec --recorded --json
```

Use an exact channel ID from `watch` or `windows` for a live dossier. `--recorded` does not access the network. Recorded verifier bundles cover the example payout and one open forced claim. Other recorded channels attach an empty bundle and report unavailable checks.

Export a forced claim and replay it offline:

```sh
node packages/challenger/dist/cli.js dossier 0x161ebefffec5b47ef34c74a1a2c4f2003918fa569f566a242ee3eeac276bae14 --recorded --json > dossier.json
node packages/challenger/dist/cli.js replay dossier.json
node packages/challenger/dist/cli.js dossier 0x161ebefffec5b47ef34c74a1a2c4f2003918fa569f566a242ee3eeac276bae14 --recorded > dossier.md
```

Replay exits with the verifier result: `0` for complete passing checks, `1` for failed checks and `3` for incomplete evidence. The recorded forced claim exits `3`. The dossier hash can match while proof remains unavailable.

`watch` reads one snapshot. It does not run a background loop. The output prints its source, observation times, evaluation time, coverage and request count. `--limit` affects display only. Ranking uses the retrieved cohort.

## Import

```ts
import { Watcher, analyze, draftDossier } from "@flop-lab/challenger";
import { McpClient } from "@flop-lab/mcp";

const client = new McpClient({ retries: 1 });
const watcher = new Watcher(client);
const report = analyze(await watcher.read(), Date.now());
const first = report.rows[0];
if (first) {
  const dossier = await draftDossier(report, first.settlement.channelId, client);
  console.log(dossier.mode, dossier.checks);
}
```

## Exact block windows

The [published SDK 0.4.0 chain wrapper](https://unpkg.com/@flop-labs/sdk@0.4.0/dist/compute-channel/chain.d.ts) documents cooperative `settle` as immediate payout with no standard dispute window. `forceSettle` emits `SettlementPosted` with `challengeEnd`. `finalize` pays after that window closes. The broader challenge-design page describes other audit lanes but does not establish their availability for a tape row.

Cooperative `computeChannel.Settled` rows therefore show `no-standard-window` with no invented expiry. Non-cooperative final payouts show `unknown` because the posting time is missing. A final payout does not start a new window.

The pinned [protocol parameter file](https://raw.githubusercontent.com/flop-labs/yellowpaper/2a2cc8218048a2933071bb2f45d75335560e39d8/params/flop-protocol-params.yaml), recorded at `2026-11-06T03:49:31.027Z`, defines `channel_dispute_window_blocks`:

```text
on_chain: {constants: [ComputeChannel.DisputeWindow]}
    value: 604_800
    unit: blocks
```

The calculation uses the channel's explicit `challengeEnd`, not its last status update block. Remaining blocks are `max(0, challengeEnd - finalizedBlock)`. Positive remaining blocks are **open**. The final **7200 blocks** are **closing** under this tool's attention policy. That threshold is not a protocol response deadline. Zero remaining blocks are **closed**. Equality is conservatively treated as closed because the exact runtime endpoint inclusion rule is not established by the public parameter file. Closed does not mean finalized payment.

The [pinned paper section 12.1g](https://github.com/flop-labs/yellowpaper/blob/2a2cc8218048a2933071bb2f45d75335560e39d8/yellowpaper.md#121-sessions--attested-streaming--aggregate-settlement) requires finalized-prefix deadlines and freezing during finality stalls. Missing reported finality stays unknown. Best head is never substituted. Reported safe mode suppresses time extrapolation. A deployed runtime constant and finality proof remain unverified.

Estimated time remaining is `remainingBlocks * (lastTimestamp - firstTimestamp) / (lastHeight - firstHeight)`. The estimate is anchored at the head's capture time. It is never advanced using the viewer's clock. Missing or invalid cadence leaves time unavailable without discarding the block result. Documentation is not a live runtime observation. The capacity-bond revocation window is a different parameter and is not used here.

Forced claims sort closing, open, unknown then closed, with end block as the tie-breaker. The payout tape retains its separate review score. A posting timestamp alone no longer creates a seven-day wall-clock estimate.

## Review formula

These weights are review policy choices, not measured probabilities. The score sums available components without renormalizing. Ratio components are truncated to two decimal places using integer arithmetic. Amounts and decimal prices never pass through floating-point conversion before comparison.

| Signal                     | Points                                             | Observed inputs                                                                                                                                              |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Payment exposure           | `25 * minerPaid / max(minerPaid)`                  | Retrieved tape. Miner stake is not available.                                                                                                                |
| Non-cooperative settlement | 20 if `cooperative = false`, else 0                | Settlement row. No fraud inference.                                                                                                                          |
| Unused escrow              | `15 * unusedEscrow / escrow`                       | Unavailable when escrow is zero or unused exceeds escrow.                                                                                                    |
| Reported assurance         | Soft: 10. Hard: 0. Other: unavailable.             | Reported tier only.                                                                                                                                          |
| Miner history              | `15 * priorNonCooperative / priorCount`            | Same miner, earlier block and no later timestamp. Excludes current channel. Unavailable without history.                                                     |
| Price outlier              | 15 if price exceeds twice the upper median, else 0 | At least three other nonzero-compute rows matching model, tier, market and GPU SKU, including null SKU. Unavailable for zero median or zero current compute. |

Payment exposure is unavailable when all observed payments are zero. A missing model or tier makes the price cohort unavailable. Price comparison uses the full retrieved tape, not a historical backtest.

Confidence is the count of available signals out of the defined signals plus tape completeness. It is field coverage, not statistical confidence. Missing data is visible and earns no points. A low score with missing data does not mean low risk. The tool has no slashing-history feed.

## Evidence and feasibility

Dossiers include the raw settlement row when present, a verifier v2 bundle and its replayed report. Checks include exact arithmetic, indexer cross-view agreement, receipt links, quote envelopes, declared digests and TCB bindings when evidence exists. Missing attestation or receipt bytes remain unverifiable. Simulated service output never becomes proof. Unpaid forced claims have no invented payout or review score.

JSON exports hash canonical UTF-8 JSON with sorted object keys, excluding only the top-level `sha256` field. Markdown includes the same hash and complete JSON attachment. `replayDossier()` checks the outer hash, observation hashes, channel binding, verifier results and block-window replay without network access. Hashes detect edits relative to the recorded hash; anyone can reseal altered content. They do not authenticate its author or the upstream source. Legacy review-score fields are preserved under the hash but are not recomputed by replay.

The SDK defines DA transcript encoding, TOPLOC checker interfaces, bisection helpers and `DisputeEvidence`. The selected public channel does not supply the required per-turn inputs. DA retrieval, prefill reproduction, TOPLOC comparison, signed-turn evidence, finality and caller eligibility remain explicitly unverifiable.

Dossiers name the documented validator-quorum call `computeChannel.reportToplocMismatch(channelId, miner, attestations)` as a reference. No attestation bundle is available and no call is constructed. The discretionary `open_dispute` signature is not exposed by the inspected chain wrapper. Its documented 100 FLOP bond is a separate lane and can be forfeited if frivolous. Its live value is not verified. The executable extrinsic remains null. See [FEASIBILITY.md](./FEASIBILITY.md).

## Data, cost and tests

The web workbench is at `/challenger`. It shows a scroll-linked closing timeline with filters, a separate payout tape, verifier-backed dossiers and local replay. See [the page README](../../apps/web/app/challenger/README.md) for cache and request limits.

Raw SSE fixtures are in `fixtures/`. The tools response uses lossless base64 transport encoding to retain its original punctuation without changing bytes. `manifest.json` records the exact requests and UTC capture times from 2026-11-05T09:00:00.819Z through 09:00:03.613Z. The recorded tape has 336 rows across four pages. All are cooperative payouts. None establishes a standard dispute window. The two recorded blocks span 100 intervals and 102000 milliseconds, giving 1020 milliseconds per interval. These are indexer observations at capture time. `fixtures/sdk/` preserves the inspected SDK declarations and chain implementation with hashes and retrieval times.

`fixtures/windows/` retains the parameter source, introspected channel schema, forced claims, recent blocks and verifier bundles. The window capture at `2026-11-06T03:52:08.729Z` observed 10 forced claims: 3 open and 7 closed against reported finalized head 3013999. It used 4 HTTP attempts. The block sample spans 100 intervals and measured 1000 ms per block. The complete window and two-bundle recording used 17 HTTP attempts with no retries. These are capture facts, not current network claims.

Tape collection defaults to at most 1000 rows in pages of at most 100, plus stats and two blocks. Window collection reads at most 100 forced claims, a finalized head and two blocks. Truncation is explicit. Verifier collection reads at most 100 matching-agent settlement rows and the bounded v2 evidence set. The shared client spaces requests and backs off on 429 or 5xx. The default watcher allows one retry. There is no failure polling loop.

`Watcher` shares concurrent reads and caches snapshots or failures for 60000 milliseconds after collection ends. Cached data keeps its original timestamps. There is no disk cache. Pagination is not atomic. Duplicates, changing totals, limits and empty pages that claim more data mark coverage partial. Malformed required rows fail the read. A cadence failure leaves the tape usable with a warning.

```sh
pnpm --filter @flop-lab/challenger check
FLOP_LIVE=1 pnpm --filter @flop-lab/challenger exec vitest run test/live.test.ts
```

The live check skips when the endpoint is unavailable. Fixture tests cover boundaries, hostile inputs, exact decimal thresholds, missing evidence, unstable pagination and cache behavior. `pnpm --filter @flop-lab/challenger record` deliberately refreshes the recorded public fixtures. It makes bounded read-only calls.

## What this does not verify

This tool does not establish fraud, runtime challengeability, exact endpoint inclusion, finalized inclusion, caller eligibility, current bond requirements, miner stake, hardware authenticity or inference correctness. It does not retrieve DA audit blobs, re-run a prefill, compare TOPLOC fingerprints or perform bisection. It never submits a dispute. Public views share infrastructure and captures are non-atomic. The indexer can be stale and devnet can reset. A block classification is conditional on its observations. A time estimate is not a safe filing deadline.
