# Network history

How has the devnet changed between observations? Record the public sources in a dated JSON snapshot. Compare block height, accounts, the reported genesis hash and harness claim status across runs.

## Quick start

Run from the repository root with Node 22 and pnpm installed:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/recorder build
pnpm exec tsx packages/recorder/src/cli.ts analyze --store packages/recorder/test/fixtures/seed
```

## Record and inspect

```sh
node packages/cli/dist/cli.js history record --store ./archive
node packages/cli/dist/cli.js history analyze --store ./archive
node packages/cli/dist/cli.js history --help
```

Build the suite with `pnpm -r --if-present run build` before using the shared `flop` binary. `flop-recorder verify <file>` checks a snapshot's content digest. `record --evidence <directory>` also saves the original HTTP responses with their request, source time and duration. These files are for local inspection. The daily archive contains compact snapshots only.

## Importable API

```ts
import { recordSnapshot, storeSnapshot, analyze } from "@flop-lab/recorder";

const { snapshot } = await recordSnapshot();
const index = await storeSnapshot("./archive", snapshot);
const { series, events } = analyze(index);
```

Each run reads MCP stats, health, a settlement page, the PoUI leaderboard and the trust root. It reads the gateway model list with price sources. Indexer queries read stats, block zero and network value. The schema was introspected before recording the fixtures.

The harness runs the fixed `mcp-health`, `price-source-expiry` and `settlement-conservation` claims through its importable runner. It has an eight-request budget. Source reads have a sixteen-request budget. Both include retries. No spending is enabled. The shared transport spaces requests to each host, bounds response size and times out attempts. It retries at most once for retryable failures with backoff. The gateway honors a bounded Retry-After delay on HTTP 429 and 5xx.

There is no cross-run source cache. Every run obtains new observations. The public feed uses a five-minute revalidation window. The home panel coalesces fallback requests within that window. Missing, malformed or oversized source data is marked unavailable. It never becomes a zero count.

## Snapshot and archive format

Version 1 hashes UTF-8 canonical JSON with SHA-256. Object keys sort recursively. Array order stays fixed. The `id` field is excluded from its own hash. Each source observation carries its request source, measured time, duration, status and value or error. Child fields inherit that observation's source and time. The trust-root digest covers canonical returned JSON. It is distinct from the server's `snapshotHash`.

Snapshot JSON is below 100 KB. Raw fixtures are below 200 KB each. A growing source that exceeds its allocation is marked unavailable. Settlement and PoUI samples request at most five rows. The snapshot does not crawl the chain.

The local store uses `snapshots/YYYY/MM/DD/<time>-<hash>.json` and `index.json`. It takes an exclusive lock, writes immutable snapshot files and replaces the index atomically. A failed run does not delete earlier observations. The rolling index retains up to 366 recent runs within a 3.9 MB ceiling. Earlier snapshot files stay in the archive. Two runs with an identical start time but different content are rejected.

The scheduled workflow stores this tree on the separate `data` branch. It does not change main. `/api/history.json` exposes the index, scalar series and model fallback. `/history/feed.xml` exposes reset signals and claim changes. These feeds say no data yet until the branch exists. The page uses explicitly labelled recorded fixtures when the branch is absent or unavailable.

## How comparisons work

- Each non-array scalar field has a sourced time series. Array fields expose their counts. Models expose the model count and distinct price-source addresses.
- A lower block height or account count than the previous available value is a reset signal. MCP and indexer observations remain separate.
- A changed indexer block-zero hash is another signal. If no hash is returned, genesis remains unknown.
- Claims produce an event when their status changes. PASS, FAIL, UNVERIFIABLE and SKIPPED remain distinct.
- Missing observations produce gaps. Comparisons resume at the previous available value and keep its timestamp.

The page draws straight segments between observed points. It does not infer values between runs. Reset signals can reflect an indexer correction or a change of backend. They do not establish that the chain reset.

## Checks

`pnpm --filter @flop-lab/recorder check` replays the recorded HTTP responses through the shared MCP client and real harness. It covers empty responses, outages, corrupt snapshots, unsafe paths, duplicate entries, exact zero counts and changed claims. Synthetic mutations test reset detection without presenting synthetic history as live data.

## What this does not verify

The recorder does not verify consensus, finality, inference correctness, proof validity or the completeness of an indexer. A content hash detects changed bytes. It does not authenticate the archive author. The public index is a validated summary, not a signed chain commitment. The block-zero hash is reported by the indexer, not independently verified against a node. Gateway price sources are listings, not active operator counts. Historical quotes can be expired. Small samples do not describe all settlements or miners. Runs are independent observations, not atomic chain snapshots. The bundled runs were captured close together and do not establish a daily trend.
