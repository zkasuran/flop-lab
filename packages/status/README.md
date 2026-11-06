# Service status

Are FLOP's public services answering? `flop-status` makes a bounded read-only request to each listed service. It checks the response content and records the source, capture time, HTTP status and elapsed time. History reports the fraction of measured probes that passed.

## Quick start

From the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/status build
node packages/status/dist/cli.js history --file packages/status/test/fixtures/history.jsonl
```

This reads bundled real captures without contacting a service. Run a new capture with:

```sh
pnpm --filter @flop-lab/cli exec flop status probe --json
node packages/status/dist/cli.js probe --archive ./status-archive --observer local --json
```

Build the suite first with `pnpm -r --if-present run build` to use `flop`. A probe exits 0 when all content checks pass, 1 when a measured probe fails and 2 for input or archive errors. Failed probes are archived before exit 1. `history` exits 0 for valid history even when it contains failed probes.

## Probe boundaries

| Service | Request | Content required |
| --- | --- | --- |
| Gateway | GET `https://api.flop.network/v1/models` | A JSON list whose entries have nonempty string model ids. An empty list passes. |
| Hosted MCP | initialize `https://mcp.flop.network/mcp` | Matching JSON-RPC id, protocol version, server information and capabilities. |
| Docs | GET `https://docs.flop.network/llms.txt` | FLOP text and a docs URL. |
| Docs assistant | initialize `https://ask.flop.finance/mcp` | The same initialize envelope checks. |
| Explorer page | GET `https://explorer.devnet.flop.network/` | HTML with a FLOP explorer title and application markup. |
| Faucet page | GET `https://faucet.flop.network/` | HTML with a FLOP faucet title and application markup. |
| Technocore health | GET `https://technocore.chat/healthz` | Plain text `ok`. |
| npm SDK metadata | GET `https://registry.npmjs.org/@flop-labs/sdk/latest` | SDK package name, version and registry tarball URL. |

All passes require HTTP 200. MCP calls use `@flop-lab/mcp`. The default deadline is 10000 ms including the body. `--timeout-ms` accepts 1 to 30000. Responses stop at 196608 bytes. These are configured limits, not measured service performance. Distinct hosts run concurrently. Redirects are not followed. Each round attempts one request per service and never retries within the round.

Latency uses a monotonic local clock from request start through body reading and content parsing. It is not server processing time. A timeout reports elapsed waiting time. Capture dates use the local UTC clock. `observer` identifies the capture origin; it is a label rather than an authenticated identity.

`createMonitor()` coalesces concurrent callers and returns copies of cached observations. Its success TTL is five minutes. A failed round doubles the cooldown up to one hour. `Retry-After` can extend that cooldown up to one day. Standalone CLI processes do not share a cache. Space manual rounds by at least five minutes and honor recorded `retryAfterMs` before repeating them.

## Measured availability and incident spans

Availability is `passed / samples`. Every observed probe has equal weight. The output states the sample count and inclusive UTC window. An empty window returns `null`, rendered as `No data`. This is sample availability, not time-weighted uptime. Missing scheduled runs add neither a pass nor a failure.

Exact duplicate captures are counted once. Conflicting copies with the same observer and start time are rejected. Incident spans join adjacent failures from the same observer. A gap over 4.5 hours breaks the span. The first passing sample marks observed recovery. The actual start, duration and recovery time of an outage remain unknown.

```sh
node packages/status/dist/cli.js history --file ./status-archive/status/recent.jsonl --from 2026-11-06T00:00:00.000Z --to 2026-11-07T00:00:00.000Z --json
```

## Archive and page

`--archive` appends a validated capture to `status/YYYY/MM/DD.jsonl` using its UTC start date. `status/recent.jsonl` retains the last 24 rounds. Re-appending the same capture is idempotent. Serialize archive writers. The recent file is replaced atomically; a repeat after interruption repairs it from that day's captures.

The scheduled workflow is proposed separately for human review. Its configured cadence is every three hours. It writes only the `data` branch and shares the recorder workflow's concurrency group. The first hosted run is required to verify scheduling and authenticated publication.

`/status` reads the public recent archive with a five-minute page cache. It shows the source mode and original dates. A failed archive read falls back to bundled real observations. A valid empty archive remains empty. The page does not probe the services for each visitor. `/status/recording` exports the displayed JSONL and its `X-Status-Source` header distinguishes the archive from fixtures.

## Library

```ts
import { probeServices, analyzeHistory, appendRun } from "@flop-lab/status";
const run = await probeServices({ observer: "local" });
await appendRun("./status-archive", run);
const report = analyzeHistory([run], { from: run.startedAt, to: run.finishedAt });
console.log(report[0]?.availability);
```

## Evidence and checks

`test/fixtures` holds raw response bodies encoded as JSON strings, source metadata and capture records. Decode a body with `JSON.parse` to recover its text. Unicode escapes preserve source typography without changing the decoded response. The bundled captures were taken close together and do not establish a daily trend.

```sh
pnpm --filter @flop-lab/status check
pnpm exec tsx packages/status/scripts/capture.ts
```

The capture script is an explicit live operation. Tests replay recorded responses offline and cover wrong content, malformed RPC, redirects, rate limits, hanging bodies, network failures, cache cooldowns, duplicate captures, empty windows and incident gaps.

## What this does not verify

These probes do not verify inference, individual MCP tools, docs accuracy, explorer queries, indexer freshness, faucet funding, Technocore writes, npm tarball downloads, consensus or chain health. A passing static page or health path does not establish that another path works. Public access restrictions and local network failures can cause failed probes. The records do not prove uninterrupted uptime, outage duration or archive authorship. Devnet can reset. The scheduled workflow and deployed page require their own hosted verification.
