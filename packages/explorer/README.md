# FLOP evidence explorer

What is in this block, transaction, account, compute channel or HTLC? Search one identifier and inspect the values alongside the exact query, public source and observation time. Unknown hashes are checked against every supported hash kind. Multiple matches stay visible.

## Quick start

Run from the repository root with Node 22 and pnpm. The final command reads the public devnet:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/explorer build
node packages/explorer/dist/cli.js block:2990806 --json
```

After building the suite, `node packages/cli/dist/cli.js explore block:2990806 --json` runs the same binary. The package binary is `flop-explorer`.

## Search

Pass a decimal block number, a 32-byte `0x` hash or an SS58-shaped address.
Optional prefixes are `block:`, `tx:`, `account:`, `channel:` and `htlc:`.
Prefixes avoid unrelated hash lookups. Numeric channel IDs are not part of the observed schema.
`--json` prints the complete report. Plain output includes values and query evidence.
Exit codes: `0` found, `1` invalid input, `2` no indexed match and `3` partial or unavailable evidence.

```ts
import { Explorer, settlementArithmetic } from "@flop-lab/explorer";
const explorer = new Explorer();
const report = await explorer.search("block:2990806");
console.log(report.entities, report.lookups);
console.log(settlementArithmetic({ escrow: "10", minerPaid: "8", burned: "1", unusedEscrow: "1" }));
```

## Evidence and bounds

Every observation carries its source, tool, query, variables, receipt time and raw response.
Derived values name their input observations and formula. Escrow conservation is
`minerPaid + burned + unusedEscrow = escrow` using exact integer arithmetic.
Parent timing is the difference between indexed block timestamps in milliseconds.
All indexed token amounts remain raw integer strings. The balance tool returns formatted FLOP strings.

The shared MCP client spaces requests by 250 ms and retries once on transient errors with backoff.
The explorer serializes searches and coalesces same-key requests. Success and no-match results cache
for 15 seconds. Partial and failed results cache for 5 seconds. The cache holds at most 100 keys.
At most 16 distinct searches can wait in one process. Request counts include retry attempts.
Cache hits report zero new requests and retain the original observation times and duration.

Block transactions are matched against at most 100 recent rows. Account HTLCs and each sponsor role
read the first 20 rows. These windows are not complete history. The CLI does not auto-page.
Tests replay raw dated responses in `packages/mcp/fixtures/indexer-*.json` and exercise malformed,
empty and conflicting observations. Live fixtures can outlive a disposable devnet reset.

Complete recorded searches are in `test/fixtures/`. `recordedExploration("channel")`
validates one without a network call. The site uses these as explicitly recorded examples.
`parseExploration` rejects displayed indexer values that differ from their raw response.

One local Node v22.22.2 run at 2026-11-05T21:42:14Z measured 24.6 ms for built CLI `--help`.
A `block:2990806` search took 630.4 ms wall time and made 3 requests to the hosted MCP.
These are single-run observations on the build host, not latency guarantees.

## What this does not verify

This is an evidence browser. It does not prove consensus, finality, inference, balances or payment completion.
The indexer schema does not expose transaction fees, transaction events or a block transaction filter.
Arguments are indexed text. The SS58 checksum is not checked. Indexer balances are not substituted for the balance tool.
A missing frozen balance remains unavailable. A missing indexed account is not proof that its chain balance is zero.
The HTLC checker can return unavailable text while the indexer has a row. Both observations remain separate.
An empty first page means that query returned no rows at that time. It is not proof of no activity.
