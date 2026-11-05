# FLOP scoreboard

Which miner has settlement evidence I can compare? The scoreboard ranks miners from public settlements and price sources. Each score shows its inputs and confidence. A router explains its pick or why no miner meets the policy.

## Quick start

From the repository root with Node 22 and pnpm. This ranks a dated recording at its capture time:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/scoreboard build
node packages/scoreboard/dist/cli.js rank --file packages/scoreboard/fixtures/snapshot-01.json --now 2026-11-05T08:56:16.581Z
```

## Sources and scoring

The collector reads gateway models, settlements, session offers, the proof leaderboard and indexer stats through the shared MCP client. Each raw response carries its source and measurement time. Snapshots use [schema version 1](snapshot.schema.json) and are validated when read. The [model](MODEL.md) defines the score, confidence labels and how each term can be gamed.

This private workspace package imports the already-landed shared MCP source entry. It adds no dependencies. The CLI build bundles that shared source.

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
pnpm --filter @flop-lab/scoreboard record 04
```

The fixtures include real snapshots taken at separate times, a full query-root introspection recording in `indexer-schema.json` and a real empty settlement response for a zero model hash. The empty response does not mean the whole devnet was empty. Tests derive a fully empty scenario from that response and clearly keep it separate from live measurements. Recorded snapshots retain raw values rather than fabricated successful miners.

## Website

The `/scoreboard` page shows the observed settlement sample with its source dates and age. Filter miner addresses or reorder the table by score, settlement count or address. Rank numbers always retain score order. Open a miner to inspect formula contributions, confidence, listings and recorded price history. The chart shows lower medians from stored settlement samples across models in exact source raw units. It does not show gateway quotes.

From the repository root:

```sh
pnpm --filter web exec next dev --port 3310
```

Open http://localhost:3310/scoreboard. The copyable command on the page reads a committed recording. The route policy form runs the same `pickMiner` function as the CLI with current wall-clock time. A price ceiling on the observed gateway schema produces `live-price-unknown`. Results update as listings expire. No transaction is sent.

`GET /scoreboard/snapshot` uses Next revalidation of 60 seconds and calls the package collector. Successful reads replace the entire snapshot, including empty responses. Concurrent reads share one collection. Failed reads retain the last good snapshot with a last-known label and its original dates. Cold processes fall back to the committed real recordings. Failure cooldown starts at 120 seconds and caps at five minutes. Processes do not share their in-memory fallback. The site gives the entire collection an eight-second deadline, including network reads and retry waits. Exceeding it cancels both before returning the fallback. This bounds static builds when public services stall. Request counts remain in the last successful snapshot.

Visible tabs read the route at most once per minute. Hidden tabs pause. The age and policy evaluation time use the browser clock. Stored history starts with the committed recordings and retains at most twelve distinct observations for the current page session. The graph has exact values below it. It does not fill missing samples.

Motion follows the reading sequence, shows progress through the explanation and animates row reordering, score bars and detail panels. Reduced motion uses immediate states without travel. The native miner dialog supports Escape, focus trapping and focus return. A horizontally scrollable table keeps the evidence columns available on small screens.

## What this does not verify

This tool cannot see miner uptime or inference latency. It does not run inference, verify proofs, establish finality, verify offer signatures or authorize transactions. It does not discover reachable miner endpoints. It trusts the public services' records after shape validation. The gateway's nominal listings are not binding quotes. Historical prices do not satisfy a live price ceiling.

The score covers the observed settlement sample across models. It cannot detect off-chain failures, hidden resets, collusive agents or fabricated useful work. A recent cooperative session can improve the score without demonstrating long-term reliability. Count and agent diversity can be inflated. The model documents these attacks per term. Empty and missing data are not proof of failure or safety.
