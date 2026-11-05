# @flop-lab/mcp

Typed client for the hosted FLOP MCP server (`https://mcp.flop.network/mcp`). Every other package in this repository reads the network through it.

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

## What this does not verify

It validates the shape of the answers it types, not their truth. Some tools of the server are documented as simulated (`flop_verify_tee_quote`) or partly placeholder (`flop_get_inference_receipt`). Do not present them as proof.
Set `FLOP_LIVE=1` to run the one live test. The recorded fixtures will drift from the network over time.
