# MCP console

What does a public FLOP tool return right now and how is its devnet cost estimated?
The console discovers input schemas, validates arguments and shows dated answers with their output-schema result.
It includes a bounded GraphQL playground and side-by-side cost estimates.

## Quick start

From the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/console build
node packages/console/dist/cli.js call flop_get_stats --json
```

The suite command is `flop call flop_get_stats --json` after building `@flop-lab/cli`.
The page is `/console`. Run `pnpm --filter web exec next dev --port 3500` and open `http://localhost:3500/console`.

## CLI

```sh
node packages/console/dist/cli.js list --json
node packages/console/dist/cli.js call flop_list_settlements --arg limit=5 --json
node packages/console/dist/cli.js call flop_indexer_query --arg 'query={ stats { totalBlocks } }' --json
node packages/console/dist/cli.js estimate --model qwen/qwen2.5-0.5b-instruct --tokens 1000 --output-tokens 500 --json
```

`--tokens` counts input tokens. Output tokens default to 500. Both counts must be positive integers up to 1000000.
Arguments use the advertised field type. String arguments stay strings. Arrays, objects, booleans and numbers use JSON.
Unknown or duplicate arguments fail. Missing required fields fail before the tool call.
Exit code 1 means an input or request failure. Exit code 2 means an output-schema failure or an incomplete estimate.

## Importable API

```ts
import { ConsoleService, inspectQuery, tokenCost } from "@flop-lab/console";

const service = new ConsoleService();
const result = await service.handle({ action: "call", tool: "flop_get_stats", args: {} }, "local-client");
const limits = inspectQuery("{ stats { totalBlocks } }");
const nominalFlop = tokenCost("0.006", "0.006", 1000, 500);
```

The API accepts an injected fetch and clock for deterministic tests.
It uses `@flop-lab/mcp` for discovery, SSE parsing, calls and retry backoff.
`checkSchema` checks the advertised JSON Schema with Ajv. It does not coerce values or insert defaults.
Missing output schemas are `unchecked`. A failed schema remains visible alongside the returned data.

## Console and query policy

The browser sends JSON only to `/console/api`. It never contacts the MCP server directly.
The route intersects a fixed read-only name allowlist with discovery's `readOnlyHint`.
New tools are disabled until explicitly reviewed. Generation and installation helpers are not enabled.
The initial page uses real recorded data with visible observation times. Refresh actions use live calls or explicit cache hits.

- Request bodies: at most 32768 bytes. Tool arguments: at most 16384 UTF-8 bytes.
- Query documents: at most 8192 UTF-8 bytes, 8 field levels, 100 expanded fields and 6 root fields.
- Exactly one query operation. Mutations, subscriptions, unused fragments and fragment cycles are rejected.
- Pagination: positive integer row limits up to 100. Offsets run from 0 to 10000. Variables and defaults are inspected too.
- Visitor budget: 20 units per 60-second fixed window. An estimate consumes 5 units. Other actions consume 1 unit, including cache hits.
- Per-process budget: 100 route actions per window. One upstream operation runs at a time. Busy requests receive HTTP 429.
- Cache: calls and estimates live for 60 seconds. Discovery lives for 300 seconds. At most 50 results are retained.
- Timeout: 20 seconds per operation. Each upstream body is capped at 200000 bytes with an 8-second attempt deadline.
- MCP retries: one retry with shared-client backoff on retryable failures. Gateway model reads use one attempt.

The query editor derives field names, argument names and type hints from introspection.
Choose a parent type and insert fields at the cursor. It checks syntax and bounded complexity locally.
The indexer still performs GraphQL type validation. The console does not estimate resolver work from field counts.

On Vercel, the route hashes the platform-owned `x-vercel-forwarded-for` address for its budget key.
Other deployments use one shared bucket. Client-supplied forwarding headers do not create new visitor budgets there.
Budgets and caches are process-local. Cold starts and multiple instances do not share them.

## Cost arithmetic and provenance

All four tools receive the same input and output token counts where their schemas permit them.
`flop_get_model_pricing` and `flop_compare_pricing` receive their sum.
`flop_estimate_inference_cost` uses normal urgency and requests TEE.
Each card keeps its exact arguments, response, source, timestamp and curl reproduction command.
The comparison response does not expose a full conversion formula. The page says so rather than guessing one.

Gateway arithmetic is exact fixed-point decimal arithmetic:

```text
input tokens * prompt FLOP/token + output tokens * completion FLOP/token
```

The recording at `2026-11-05T23:31Z` contains 34 tools and 22 gateway price sources.
Each recorded price source says `devnet-nominal` and carries an effective time and expiry.
The page rechecks expiry against the browser clock. Expired records remain historical evidence.
Recorded timings are absent because the recorder did not capture durations.
Fresh calls expose the measured duration of their last HTTP attempt and attempt count.

Raw responses and requests are in `fixtures/`. JSON escapes preserve source typography without literal long dash characters.
To replace the recordings deliberately, run `pnpm --filter @flop-lab/console record --all`.
The recorder makes a bounded sequence without retries. Do not use it in a polling loop.

## Checks

```sh
pnpm --filter @flop-lab/console check
pnpm --filter @flop-lab/console build
CONSOLE_LIVE=1 pnpm --filter @flop-lab/console exec vitest run
```

Fixture tests use the shared MCP replay transport. They cover real discovery, costs, expiry boundaries, shell quoting, empty data, malformed responses, request budgets, body limits and hostile GraphQL fragments.
Live smoke is opt-in and skips when the public service cannot be reached.

## What this does not verify

Schema conformance is not chain truth or proof of inference.
The console does not verify miner availability, model quality, TEE attestation, receipts, settlement finality or actual execution cost.
Some upstream tools return placeholders or simulations. Their raw values are not promoted to verified facts.
Devnet nominal prices and service-provided USD conversions are not market quotes.
No wallet, signing, gateway chat or write transaction is part of this tool.
The proxy budget is not a distributed abuse-prevention service. Visitors behind one platform address share a budget.
The browser clock determines displayed quote freshness. The devnet and its schemas can reset.
