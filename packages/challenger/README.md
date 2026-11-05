# FLOP challenger

Which settlements need a challenge-window review? Challenger separates cooperative payouts from force-settlement window candidates. It ranks records for a human to inspect and prepares a dossier with the evidence and missing checks. It never submits a dispute.

## Quick start

From the repository root with Node 22 and pnpm. This reads a recorded tape without a wallet or API key:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/challenger build
node packages/challenger/dist/cli.js watch --recorded --limit 5
```

## Read current data

```sh
node packages/challenger/dist/cli.js watch --limit 5
node packages/challenger/dist/cli.js watch --sort priority --json
```

The binary is `flop-challenger`. The direct Node command works from a checkout without a global install.

This private workspace package imports the shared `packages/mcp` source directly, matching the other tool packages. The CLI bundles that same client. It does not require a new root lockfile dependency.

Build a dossier for the channel in the recorded sample:

```sh
node packages/challenger/dist/cli.js dossier 0xa5d0a1722a5c7b8b86d7489ff1e76d0c3eb0a72e39e9c47edee1681ef766deec --recorded --json
```

Use an exact channel ID from `watch` for a live dossier. `--recorded` does not access the network. Only the selected channel has a recorded channel response. Other recorded channels produce an unverifiable channel check.

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

## Window assumptions

The [published SDK 0.4.0 chain wrapper](https://unpkg.com/@flop-labs/sdk@0.4.0/dist/compute-channel/chain.d.ts) documents cooperative `settle` as immediate payout with no standard dispute window. `forceSettle` emits `SettlementPosted` with `challengeEnd`. `finalize` pays after that window closes. The broader challenge-design page describes other audit lanes but does not establish their availability for a tape row.

Cooperative `computeChannel.Settled` rows therefore show `no-standard-window` with no invented expiry. Non-cooperative final payouts show `unknown` because the posting time is missing. A final payout does not start a new window.

Only an explicit non-cooperative `computeChannel.SettlementPosted` row gets a draft estimate: its timestamp plus `7 * 24 * 60 * 60 * 1000` milliseconds. Remaining time is clamped at zero. A future timestamp produces an unknown window. At the exact estimated expiry the window is estimated-expired. No such posting row appears in the recorded tape. Boundary tests use an explicitly labelled synthetic posting event.

The [challenge design](https://docs.flop.network/docs/verification-stack), read on 2026-11-05, says approximately seven days. It calls the design draft and the duration under review. The live runtime constant and `challengeEnd` are not verified here. The capacity-bond revocation window is a different parameter and is not used here.

Block cadence is the timestamp difference between two indexed blocks divided by their height difference. It is reported separately. It does not determine expiry. The indexer supplies observations, not an independently verified finality proof.

Default ordering: estimated-open by time left, then unknown, then estimated-expired, then no-standard-window. Review score breaks ties. `--sort priority` instead sorts the full tape by review score. Each row retains its window label.

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

Dossiers include the raw settlement row, selected channel and trust-root response with source URLs and capture times. Checks cover exact escrow conservation and agreement between the channel and tape. Data mismatch is a review finding, not proof of fraud.

The SDK defines DA transcript encoding, TOPLOC checker interfaces, bisection helpers and `DisputeEvidence`. The selected public channel does not supply the required per-turn inputs. DA retrieval, prefill reproduction, TOPLOC comparison, signed-turn evidence, finality and caller eligibility remain explicitly unverifiable.

Dossiers name the documented validator-quorum call `computeChannel.reportToplocMismatch(channelId, miner, attestations)` as a reference. No attestation bundle is available and no call is constructed. The discretionary `open_dispute` signature is not exposed by the inspected chain wrapper. Its documented 100 FLOP bond is a separate lane and can be forfeited if frivolous. Its live value is not verified. The executable extrinsic remains null. See [FEASIBILITY.md](./FEASIBILITY.md).

## Data, cost and tests

Raw SSE fixtures are in `fixtures/`. The tools response uses lossless base64 transport encoding to retain its original punctuation without changing bytes. `manifest.json` records the exact requests and UTC capture times from 2026-11-05T09:00:00.819Z through 09:00:03.613Z. The recorded tape has 336 rows across four pages. All are cooperative payouts. None establishes a standard dispute window. The two recorded blocks span 100 intervals and 102000 milliseconds, giving 1020 milliseconds per interval. These are indexer observations at capture time. `fixtures/sdk/` preserves the inspected SDK declarations and chain implementation with hashes and retrieval times.

Collection defaults to at most 1000 rows in pages of at most 100. It then requests stats and two block samples. A complete four-page replay uses seven shared-client requests. A dossier adds two. Live retries increase HTTP attempts. The shared client spaces calls by 250 milliseconds and backs off on 429 or 5xx. The default watcher allows one retry. Failure stops collection rather than starting another loop.

`Watcher` shares concurrent reads and caches snapshots or failures for 60000 milliseconds after collection ends. Cached data keeps its original timestamps. There is no disk cache. Pagination is not atomic. Duplicates, changing totals, limits and empty pages that claim more data mark coverage partial. Malformed required rows fail the read. A cadence failure leaves the tape usable with a warning.

```sh
pnpm --filter @flop-lab/challenger check
FLOP_LIVE=1 pnpm --filter @flop-lab/challenger exec vitest run test/live.test.ts
```

The live check skips when the endpoint is unavailable. Fixture tests cover boundaries, hostile inputs, exact decimal thresholds, missing evidence, unstable pagination and cache behavior. `pnpm --filter @flop-lab/challenger record` deliberately refreshes the recorded public fixtures. It makes bounded read-only calls.

## What this does not verify

This tool does not establish fraud, runtime challengeability, finalized inclusion, caller eligibility, current bond requirements, miner stake, attestation validity or inference correctness. It does not retrieve DA audit blobs, re-run a prefill, compare TOPLOC fingerprints or perform bisection. It never submits a dispute. A public indexer can be incomplete or stale. Devnet can reset. An estimated window is not a safe filing deadline.
