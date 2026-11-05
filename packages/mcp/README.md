# FLOP MCP client

How do I read FLOP's public data without rebuilding the transport? This shared client parses the hosted server's event stream, checks response shapes and returns each observation with its source and time. The tools in this repository use the same client and recorded responses.

## Quick start

From the repository root with Node 22 and pnpm. This reads public network stats:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/mcp check
pnpm exec tsx -e 'import { McpClient, getStats } from "./packages/mcp/src/index.ts"; getStats(new McpClient()).then(console.log)'
```

## Transport and typed helpers

- JSON-RPC 2.0 over POST, answered as server-sent events. Session-less.
- Retries with backoff on network errors, timeouts, 429 and 5xx. `Retry-After` is honoured. 4xx other than 429 is never retried.
- One request at a time per client, spaced by `minIntervalMs` (250 by default), so a tool cannot hammer the shared service.
- Typed helpers with runtime checks for the answers the tools in this repo use: `getStats`, `listSettlements`, `listAllSettlements`, `listSessionOffers`, `getComputeChannel`, `getTrustRoot`, `getPouiLeaderboard`, `indexerQuery`.
- Amounts stay integer strings (18 decimals). Use `BigInt` to compute. `escrowConserved` checks `minerPaid + unusedEscrow + burned = escrow` exactly.
- Recorded answers in `fixtures/` (2026-11-05) and `replayFetch()` for tests: `import { replayFetch } from "@flop-lab/mcp/fixtures"`.

```ts
import { McpClient, getStats, listSettlements } from "@flop-lab/mcp";
const mcp = new McpClient();
const { value: stats, measuredAt } = await getStats(mcp);
const page = (await listSettlements(mcp, { limit: 20 })).value;
```

The server rejects the default `Python-urllib` user agent with HTTP 403. This client sends `flop-lab/0.1 (+https://github.com/zkasuran/flop-lab)`.

## Typed indexer reads

`readIndexer(client, entity, args)` uses fixed selections and GraphQL variables.
It returns the query, variables, source, raw response and measurement time with validated data.
Use `readIndexer(client, "block", { number: 100 })` for a block or
`readIndexer(client, "computeChannels", { limit: 20, offset: 0 })` for a page.

Selections cover blocks, transactions, accounts, HTLCs, channels, settlement prices,
PoUI proofs, reliability events, miner reliability, sponsor positions and account totals.
Nullable fields remain null. Integer token amounts remain strings. Invalid shapes fail closed.
List reads default to 20 rows with a maximum of 100. No helper auto-paginates.
Blocks, transactions, HTLCs, proofs and sponsor positions return arrays without a total.
Channels, prices and reliability events return `data` and `pagination`.

`fixtures/indexer-schema.json` records full schema introspection including arguments,
defaults and nested types. The other `indexer-*.json` files retain raw tool text and capture times.
The schema does not expose transaction fees, transaction events or a block transaction filter.
A bounded recent transaction list is not a complete block transaction history.

## What this does not verify

It validates the shape of the answers it types, not their truth. Some tools of the server are documented as simulated (`flop_verify_tee_quote`) or partly placeholder (`flop_get_inference_receipt`). Do not present them as proof.
Set `FLOP_LIVE=1` to run the one live test. The recorded fixtures will drift from the network over time.
