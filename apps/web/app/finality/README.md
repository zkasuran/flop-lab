# Finality page

Is the devnet producing blocks and reporting finality? This page shows linked block intervals, reported finalized lag, quoted alert rules and dated height history from the recorder.

## Run

From the repository root:

```sh
pnpm install
pnpm --filter web build
pnpm --filter web exec next start --port 3720
```

Open `/finality`. The page uses a live observation with a labelled real-fixture fallback. Its client polls `/finality/live` every 15 seconds while the tab is visible. The route coalesces calls and caches successes and failures for 15 seconds per server instance. A failed client read stops polling and retains the last response. Resume or refresh explicitly to retry.

Each new block hash enters the strip with Motion. Select a block for its hash and timestamp. The lag bar animates between measured ratios. Its scale ends at the freeze boundary; the exact lag remains visible above it. The rule rail fills with reading progress. Disclosures and block selection use presence and layout transitions. Reduced motion uses immediate states. Shared tool markers connect the page to the suite grid.

The existing recorder provides height history. Fallback recorder samples keep their original dates. They are not averaged into production intervals. Source schema and rule excerpts are in `packages/finality/test/fixtures`.

## What this does not verify

No consensus signatures, finalized-prefix storage, canonical-chain membership, validator set or rotation execution is verified. API heads and state labels are reports. Cache limits are per instance. The paper provides no finality latency SLA. Recorder height history is not finalized-head history. Live observations can become stale or the devnet can reset.
