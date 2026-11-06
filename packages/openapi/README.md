# Suite API

How do I read the suite's results as an API? `@flop-lab/openapi` exposes dated recorded summaries through a read-only JSON service, an importable library and the `flop api` command. Every result carries a schema version, observation times, sources and explicit evidence limits.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/openapi build
pnpm --filter @flop-lab/openapi start result models
```

After the suite build, use `pnpm --filter @flop-lab/cli exec flop api result models`.
`flop-openapi list` lists result names. `flop-openapi document` prints the OpenAPI document. All commands read bundled evidence and make no network requests.

## HTTP

Run `pnpm --filter web exec next dev --port 3780`. Open `/openapi` for the endpoint reference.

```sh
curl --fail-with-body 'http://localhost:3780/api/v1/models'
curl --fail-with-body 'http://localhost:3780/api/v1/openapi.json'
```

GET and HEAD routes:

| Path                   | Result                                                      |
| ---------------------- | ----------------------------------------------------------- |
| `/api/v1/verifier`     | Arithmetic outcomes for the first bundled settlement page   |
| `/api/v1/harness`      | Last bundled coverage run, outcome counts and request count |
| `/api/v1/spec`         | Pinned paper and public catalogue diff outcomes             |
| `/api/v1/contracts`    | MCP contract board tool outcomes                            |
| `/api/v1/models`       | Catalogue-wide and per-model check outcomes                 |
| `/api/v1/status`       | Service availability evidence or explicit unavailable state |
| `/api/v1/watch`        | Default-rule replay over recorded polls                     |
| `/api/v1/openapi.json` | Generated OpenAPI 3.1 document                              |

Result bodies use `schemaVersion: "1.0.0"`. `measuredAt` is the latest source observation, not response time. `sources` retains every distinct source/time pair. `recordings` points to pinned raw evidence or its manifest. `summary.metrics` names measured counts. `summary.outcomes` preserves the upstream status vocabulary. A missing recording uses `mode: "unavailable"`, null summary and no measurement date. It never substitutes zero for missing evidence.

Validated response bodies cache for 300 seconds per process. `X-Data-Revalidate` states this TTL. `X-Data-Cache-Age` states the internal cache age. This refreshes validation of bundled data, not the upstream network. New evidence ships with a new bundle.

The in-memory limiter allows 60 reads per IP in a 60-second fixed window shared across all versioned endpoints on each server instance. It keeps at most 4096 active IP buckets. Full storage rejects new buckets until entries expire. It never evicts an active quota to admit another address. HTTP responses use `private, no-store` so shared HTTP caches cannot bypass the limiter.

Vercel deployments use the platform-overwritten `x-vercel-forwarded-for` header. Other deployments use one shared unknown-client bucket by default. When mounting `createApi` elsewhere, inject `address(request)` from a trusted socket or proxy that overwrites its header. Do not pass arbitrary client headers. Separate processes have separate quotas. Configure a shared edge limiter for a deployment-wide quota.

HTTP 429 includes `Retry-After` seconds. Wait that long. Back off on HTTP 5xx. Invalid bundled evidence returns 503. Unknown routes return 404. Query parameters return 400. Other methods return 405 with `Allow: GET, HEAD`. Error bodies have the same schema version and a stable error code.

## Library and evidence updates

```ts
import { readResult, parseResult, openapiDocument, createApi } from "@flop-lab/openapi";
const models = readResult("models");
parseResult("models", models);
const contract = openapiDocument();
const serve = createApi();
const response = serve(new Request("http://localhost/api/v1/models"));
```

`src/schema.ts` defines the exact response schemas used by runtime validation and OpenAPI generation. Contract tests resolve each route's document schema and validate its response. They cover missing evidence, inconsistent totals, invalid dates, errors, quota boundaries and cache expiry.

`pnpm --filter @flop-lab/openapi record` regenerates `src/results.json` through the existing suite readers and classifiers. It reads the already committed raw fixtures. No live calls occur. Review the recording revision in the script before updating its pinned links. The generated file is a projection, not a second raw capture. Original raw responses, source URLs and times remain in the linked suite fixtures.

Run `pnpm --filter @flop-lab/openapi check` and `pnpm --filter @flop-lab/openapi build` after changes.

## What this does not verify

Bundled results do not establish current uptime, continuous history, inference correctness, authenticated source identity, consensus or deployed runtime parameters. Passing arithmetic and schema checks are narrower claims. The API does not start scans, expose user-local harness runs or refresh upstream observations. Per-process quotas do not establish a deployment-wide limit. Production deployment and a distributed edge limiter require separate verification.
