# FLOP scoreboard

Which miner has evidence I can rely on over time? The scoreboard compares settlement history, acknowledgements, ghost outcomes and proof activity. Each score shows its formula and source dates. The router explains its pick or refusal.

## Quick start

From the repository root with Node 22 and pnpm. This ranks a dated recording at its capture time:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/scoreboard build
node packages/scoreboard/dist/cli.js rank --file packages/scoreboard/fixtures/snapshot-04.json --reliability-file packages/scoreboard/fixtures/reliability-04.json --now 2026-11-05T22:49:04.652Z
```

## Sources and scoring

The collector reads gateway models, settlements, session offers, the proof leaderboard and indexer stats through the shared MCP client. It queries `minerReliability`, `minerReliabilitySeries`, `minerGhostStatsSnapshots`, `reliabilityEvents` and `pouiLeaderboard` using the recorded introspection schema. Each response carries its source, query and measurement time. Snapshots use [schema version 1](snapshot.schema.json) with optional reliability and archive evidence. The [model](MODEL.md) defines both score versions and their limits.

Old snapshots keep `settlement-v1`. New collections use `evidence-v2`: half the settlement score plus acknowledgement, ghost, cumulative outcome and proof terms. Missing terms earn no points. Confidence still describes settlement evidence only. Reliability is a heuristic over the captured window, not a success probability or FLOP FRCR.

This workspace package imports the shared MCP client and recorder validators. The CLI build bundles those sources.

## Run

From the repository root with Node 22 and pnpm:

```sh
pnpm install
pnpm --filter @flop-lab/scoreboard build
pnpm --filter @flop-lab/scoreboard cli snapshot --out /tmp/opencode/scoreboard-a01.json
pnpm --filter @flop-lab/scoreboard cli rank --file /tmp/opencode/scoreboard-a01.json
pnpm --filter @flop-lab/scoreboard cli route --file /tmp/opencode/scoreboard-a01.json --model qwen/qwen2.5-0.5b-instruct --max-price-per-gflop 0.01 --json
```

The last command exits with status 2 when there is no eligible miner. Current gateway listings have no per-GFLOP quote. A ceiling cannot pass on a historical price. Omit the ceiling only when you want a discovery recommendation without a price guarantee.

The built binary has the same commands:

```sh
node packages/scoreboard/dist/cli.js --help
node packages/scoreboard/dist/cli.js rank --file packages/scoreboard/fixtures/snapshot-01.json --now 2026-11-05T08:56:16.581Z --sensitivity
node packages/scoreboard/dist/cli.js explain 5FkMpoVojgbmpex4ENpLimrQ29pMPQK8qJZRWDHpQxYELwZ1 --file packages/scoreboard/fixtures/snapshot-01.json --now 2026-11-05T08:56:16.581Z
```

`--json` produces machine-readable output. `--exclude` can be repeated. `--min-confidence` accepts a value from 0 to 1. Offline reads make no requests. Evaluation uses the current time unless `--now` is supplied. An expired snapshot cannot route to an expired listing.

### Reliability policy

```sh
node packages/scoreboard/dist/cli.js route --file packages/scoreboard/fixtures/snapshot-04.json --reliability-file packages/scoreboard/fixtures/reliability-04.json --model qwen/qwen2.5-0.5b-instruct --min-reliability 0.9 --min-reliability-outcomes 5 --min-proofs 1 --reject-ghost-failures --json
```

Thresholds in this command are policy choices. A requested acknowledgement ratio defaults to a minimum of five observed outcomes. Missing acknowledgement or proof evidence refuses even a zero threshold. `--reject-ghost-failures` refuses unknown ghost outcomes as well as observed failures. Required reliability evidence has a default maximum age of one day. Override it with `--max-reliability-age-ms`. Routing always requires settlement evidence and an effective gateway listing. Proof activity alone cannot route a miner.

### Recorder history

The collector checks the public recorder `data/index.json` and reads at most eight snapshots from the last seven days. Each snapshot is checked against its content hash and index entry. `rankRecordedHistory(snapshot)` scores each sample separately at capture time using settlement-v1. Missing days stay missing. The latest ranking only pools archived channels when a non-null observed genesis matches the current indexer observation. Repeated channels count once. Combined samples retain the partial-tape confidence cap.

If the archive is absent or unavailable, the collector returns that state and uses indexer reliability series. The bundled recorder samples have no genesis hash. They receive separate rankings rather than being pooled. The archive does not yet record reliability series, so those terms always use the indexer.

## Import

```ts
import { Collector, rankSnapshot, pickMiner } from "@flop-lab/scoreboard";

const collector = new Collector();
const snapshot = await collector.snapshot();
const rows = rankSnapshot(snapshot, { now: Date.now() });
const route = pickMiner(snapshot, {
  model: "qwen/qwen2.5-0.5b-instruct",
  minConfidence: 0.2,
  now: Date.now(),
});
```

One collector shares calls in flight and caches a validated snapshot for 60 seconds. Returned snapshots are independent copies. A refresh failure throws instead of disguising cached data as live. Gateway calls have a 10-second timeout and at most two retries. Retries use exponential backoff for network errors, HTTP 429 and 5xx. Retry-After is honored up to 30 seconds. MCP uses the shared client's request spacing and backoff. `snapshot.collection` records request count and collection duration. `collector.stats` counts cumulative requests and cache hits. No background polling runs in the library.

The newest settlement page is bounded to 100 rows. It is not a complete network scan. Coverage and the confidence cap are shown per miner. Rankings and displayed historical medians summarize the included sample across models. Historical medians are not per-model quotes.

## Check and record

```sh
pnpm --filter @flop-lab/scoreboard check
pnpm --filter @flop-lab/scoreboard record 05
```

The fixtures include real snapshots taken at separate times, a full query-root introspection recording in `indexer-schema.json` and a real empty settlement response for a zero model hash. The empty response does not mean the whole devnet was empty. Tests derive a fully empty scenario from that response and clearly keep it separate from live measurements. Recorded snapshots retain raw values rather than fabricated successful miners.

The reliability recording at `2026-11-05T22:49:04.650Z` has 24 miner summaries, 33 daily buckets, 100 events and 100 ghost snapshots. Its proof leaderboard is empty. Raw reliability and base snapshot responses are stored separately to keep each file under 200 KB. Controlled test inputs exercise nonempty proof activity and failure terms. They are not devnet measurements.

## Website

The `/scoreboard` page shows the observed sample with source dates and age. Compare two miners on the same fields. Open a miner for its event timeline, ghost counters and formula terms. Filter the timeline by event kind. Recorder sample scores appear when available. The price chart shows stored settlement medians in exact source raw units.

From the repository root:

```sh
pnpm --filter web exec next dev --port 3560
```

Open http://localhost:3560/scoreboard. The copyable command replays a committed recording at capture time. The route policy form runs `pickMiner` with current wall-clock time. A price ceiling produces `live-price-unknown`. Results update as listings expire. No transaction is sent.

`GET /scoreboard/snapshot` uses Next revalidation of 60 seconds and calls the package collector. Successful reads replace the entire snapshot, including empty responses. Concurrent reads share one collection. Failed reads retain the last good snapshot with a last-known label and its original dates. Cold processes fall back to the committed real recordings. Failure cooldown starts at 120 seconds and caps at five minutes. Processes do not share their in-memory fallback. The site gives the entire collection an eight-second deadline, including network reads and retry waits. Exceeding it cancels both before returning the fallback. This bounds static builds when public services stall. Request counts remain in the last successful snapshot.

Visible tabs read the route at most once per minute. Hidden tabs pause. The age and policy evaluation time use the browser clock. Stored history starts with the committed recordings and retains at most twelve distinct observations for the current page session. The graph has exact values below it. It does not fill missing samples.

Motion follows the reading sequence, shows progress through the explanation and animates row reordering, score bars and detail panels. Reduced motion uses immediate states without travel. The native miner dialog supports Escape, focus trapping and focus return. A horizontally scrollable table keeps the evidence columns available on small screens.

## What this does not verify

This tool cannot see miner uptime or inference latency. It does not run inference, verify proofs, establish finality, verify offer signatures or authorize transactions. It does not discover reachable miner endpoints. It trusts the public services' records after shape validation. The gateway's nominal listings are not binding quotes. Historical prices do not satisfy a live price ceiling.

The score covers bounded samples across models. It cannot detect off-chain failures, hidden resets, collusion or fabricated useful work. Complete-day buckets omit partial edge days. Cumulative outcomes overlap and are not a session success rate. A ghost task does not establish registration or current endpoint availability. Proof count does not establish proof validity. Recorder content hashes do not prove authorship or chain finality. Empty and missing data are not proof of failure or safety.
