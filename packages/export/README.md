# Export devnet data

How do I get devnet data into a spreadsheet or notebook? `flop export` writes bounded CSV, NDJSON or Parquet parts. Each part carries a sidecar with its source, query, measurement times, row count and SHA-256. Resume checks the saved bytes before reading more rows.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/export build
node packages/export/dist/cli.js settlements --recorded --format parquet --out "$(mktemp -d)"
```

The example uses a bundled recording. It makes no network requests. After building the workspace, `node packages/cli/dist/cli.js export --help` runs the same CLI. The package binary is `flop-export`. In the commands below, replace `flop` with `node packages/cli/dist/cli.js` when running from this checkout.

## Choose a dataset and range

```sh
flop export settlements --format csv --offset 0 --rows 1000 --page-size 100 --max-requests 10 --out ./settlements
flop export --resume --out ./settlements --max-requests 10
flop export accounts --addresses ./addresses.txt --format ndjson --out ./accounts
flop export snapshots --archive ./archive --format parquet --out ./snapshots
```

Datasets: `settlements`, `channels`, `blocks`, `transactions`, `accounts`, `models`, `price-sources`, `proofs` and `snapshots`.

- `--offset` is a zero-based source row offset. `--rows` is the maximum row count to export. It is not a block or time range.
- `--page-size` is 1 to 100. Each part contains at most that many rows. Accounts use one lookup per part.
- `--max-requests` counts actual HTTP attempts for this invocation, including retries and the resume boundary check. Its default is 10. Zero permits only cached or local input. A fresh live reader has no persistent cache.
- The maximum range is 1,000,000 rows. The maximum HTTP budget is 10,000 attempts. These are safety limits, not measured network capacity.
- `--recorded` uses the bundled sample. Source dates remain the original recording dates. Reaching its end means the sample ended.
- Account addresses are read from a file, one per line. Duplicate addresses are rejected. The public GraphQL schema has `account(address)` but no account-list root. A missing lookup emits `found=false` with null fields.
- Snapshots read a local `@flop-lab/recorder` archive. Its validated index supplies the files. Each snapshot hash is verified. One row represents one observation. Unavailable observations retain their status and error. The archive index supports at most 366 snapshots.

`/export` previews bundled rows and builds a command. Large exports run in the CLI.

## Output and resume

An output directory contains `export.json`, then `part-000000.csv` and `part-000000.csv.manifest.json`, followed by further parts. The format extension changes for NDJSON and Parquet. Each data part is independently readable. CSV parts each have their own header. Do not concatenate their headers into one table.

The manifest records schema version, columns, the full export plan, source queries and variables, source URLs or local paths, measurement times, write time, row count, exact file SHA-256, paging state and cumulative HTTP attempts in that invocation. Do not sum `requestsThisRun` across manifests. The CLI report gives the invocation total.

Only a part with its sidecar is committed. Writes use same-directory atomic renames under an exclusive directory lock. A normal failure or exhausted budget leaves prior parts usable. Exit codes: 0 for a finished requested range, 2 for a partial export and 1 for invalid input or an integrity failure. The JSON report explains why it stopped.

Resume accepts only `--out`, `--resume` and a new `--max-requests`. The saved query is immutable. Resume verifies every committed file hash, checks sequential offsets and rejects duplicate row keys. It refetches the last committed source page before advancing. Changed content causes a refusal. Measurement timestamps alone do not count as content changes.

After a killed process, verify that no exporter is running before removing `.export-lock`. Preserve a data part with no sidecar outside the directory before resuming. The exporter refuses uncommitted or noncontiguous parts rather than overwriting them. Atomic rename is not a guarantee against power loss. Keep data and sidecars together.

## Stable v1 columns and types

Every dataset adds `source: string` and `measuredAt: string`. `measuredAt` is an ISO timestamp for the observation, not the event. In the table, unmarked fields are strings. `i` means a safe integer, `n` a finite number, `b` a boolean and `?` nullable. Column order is stable.

| Dataset | Columns in order |
| --- | --- |
| settlements | channelId, settledBlock:i, settledAt:n, agent:?, miner:?, escrow, minerPaid, burned, aggregateGn, unusedEscrow, pricePerGflop, cooperative:b?, settlementKind, settlementEvent, marketKind, modelHash:?, selfTrade:b |
| channels | channelId, agent:?, miner:?, escrow, status, paymentStatus:?, evidenceStatus:?, aggregateGn:?, minerPaid:?, burned:?, refunded:?, modelHash:?, challengeEnd:i?, marketKind, openedBlock:i, openedAt:n, updatedAt:n |
| blocks | hash, parentHash:?, number:i, timestamp:n?, extrinsicsCount:i?, specVersion:i? |
| transactions | hash, blockHash:?, blockNumber:i?, indexInBlock:i?, section:?, method:?, sender:?, args:?, success:i?, timestamp:n? |
| accounts | address, found:b, balance:?, nonce:i?, firstSeenBlock:i?, lastSeenBlock:i?, txCount:i? |
| models | modelId, registryName, registryVersion:?, promptPrice:?, completionPrice:? |
| price-sources | modelId, address, label, version, effectiveAt, expiresAt |
| proofs | id, blockHash:?, blockNumber:i?, submitter:?, gnWeight:n?, successCount:i?, taskHash:?, timestamp:n? |
| snapshots | snapshotId, startedAt, finishedAt, observation, status, valueJson, error:? |

Amounts remain exact decimal strings in raw source units. No conversion to FLOP is performed. Event timestamps retain the indexer's numeric value without unit conversion. `success` retains the indexer's integer rather than inventing a boolean interpretation. `args` retains its source text. `valueJson` stores the recorder observation value as JSON text.

Gateway model-level prices retain their declared decimal text. The recorded gateway does not state their units or individual miner prices. A price-source row advertises an address and quote interval. It does not contain a paid price. `effectiveAt` and `expiresAt` are ISO timestamps. Expired recorded quotes remain expired observations.

NDJSON uses native JSON types and explicit nulls. Parquet uses STRING, INT64, DOUBLE and BOOLEAN with explicit nullability. Empty Parquet files retain the schema. `hyparquet-writer` is pinned and uses pure JavaScript. It avoids a native database runtime for bounded part encoding. Its companion reader checks round trips in tests. Parts use uncompressed Parquet for interoperability without a codec plugin.

CSV uses UTF-8, CRLF records, quoted strings and doubled embedded quotes. Null is an unquoted empty field. An empty string is `""`. Formula-leading strings and existing leading apostrophes receive an apostrophe prefix. This changes those CSV cells for spreadsheet import. NDJSON and Parquet retain the original values. Import string columns as text to preserve long balances, identifiers and leading zeros. Spreadsheet auto-detection is not a type guarantee.

## Notebook and library use

```python
from glob import glob
import pandas as pd

frame = pd.concat(pd.read_parquet(path) for path in sorted(glob("settlements/*.parquet")))
```

```ts
import { createReader, exportDataset, parsePlan } from "@flop-lab/export";

const plan = parsePlan({
  version: 1, dataset: "settlements", format: "ndjson",
  offset: 0, rows: 100, pageSize: 100,
  addresses: [], archive: null, recorded: false
});
const report = await exportDataset({ directory: "./rows", plan, reader: createReader(plan, 10) });
```

## Sources and checks

Network data uses the shared `@flop-lab/mcp` client at `https://mcp.flop.network/mcp` and `GET https://api.flop.network/v1/models`. MCP attempts are spaced by 500 ms per reader. Retryable MCP failures and gateway HTTP 429/5xx get at most one retry. The transport caps response bodies at 2,000,000 bytes and applies a 30-second deadline. Gateway rows are cached in memory for 30 seconds. Other source pages are uncached so the resume check rereads them.

Raw fixtures in `fixtures/` retain queries, sources and times. Introspection at `2026-11-06T04:47:18.965Z` found no account-list root. The recording finished at `2026-11-06T04:47:20.580Z` after 9 HTTP requests including introspection. It includes an empty proof response. The local recorder inputs retain their earlier capture dates.

Run `pnpm --filter @flop-lab/export check`. Tests cover recorded rows, empty files, Parquet round trips, exact amounts, hostile fields, CSV escaping, request budgets, resume boundaries, duplicate pages and tampered files. `pnpm exec tsx packages/export/scripts/record.ts` refreshes the bounded fixtures using public sources and the bundled recorder archive.

## What this does not verify

These files do not prove chain completeness, finality, inference correctness, proof validity, payment completion or archive authorship. SHA-256 detects changed bytes against a saved sidecar. It does not authenticate a sidecar or its author.

The public indexer uses mutable offset pagination without a pinned snapshot token. New rows, updated channels and devnet resets can change page boundaries. Duplicate and boundary checks detect some changes. They cannot prove that no rows were skipped between sequential reads. A finished export means the requested range or reported source end was reached. It does not mean the whole chain was exported.

The browser preview is recorded data. Live CLI runs can differ. Account exports cover supplied addresses only. Recorder exports cover the local archive only. The Python example needs pandas and a Parquet engine in the user's notebook environment. It is not installed by this package.
