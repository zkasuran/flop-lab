# Model registry

Which models are served, at what price and are they registered? This read-only tool joins the gateway catalogue with MCP discovery, model details, pricing, comparisons, providers and trust-root hashes. It keeps source URLs and response times beside the results.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/models build
pnpm exec tsx packages/cli/src/cli.ts models --input packages/models/test/fixtures/devnet.json
```

The last command replays a real recording without network calls. Open `/models` on the suite site for cards, source expiry bars, read-time checks and recorder prices.

## Live reads and evidence

```sh
node packages/models/dist/cli.js --json
node packages/models/dist/cli.js --record models-recording.json
node packages/models/dist/cli.js --input models-recording.json --json --fail-on-check
node packages/models/dist/cli.js --history
```

The shared command is `flop models`. The standalone binary is `flop-models`. `--record` creates a new file and refuses to overwrite one. `--input` preserves the original dates. `--history` adds reads from the recorder data branch. It does not silently replace current observations with older quotes.

Default exit status is zero for a valid report, including unknown results. `--fail-on-check` exits one when a summary or per-model check is `FAIL` or `UNKNOWN`. Invalid command arguments or recording envelopes exit two.

## Importable API

```ts
import { catalogue, createCollector, expiry, loadPriceHistory } from "@flop-lab/models";

const collect = createCollector();
const report = catalogue(await collect());
const model = report.models.find((model) => model.gateway);
const source = model?.gateway?.sources[0];
if (source) console.log(expiry(source, new Date().toISOString()));
const history = await loadPriceHistory();
```

The collector coalesces concurrent requests and caches a complete recording for 30 seconds per instance. Cached results retain their original source times. MCP uses `@flop-lab/mcp` with a 300 ms request gap, an 8 second timeout and one retry with backoff. Gateway reads have a 20 second timeout and one retry on HTTP 429 or 5xx. Retry-After seconds are capped at 30 seconds. Network exceptions end the gateway read.

Discovery requests at most 1000 results. A response whose total exceeds its returned rows is incomplete. Detail and pricing calls cover at most 20 models, prioritizing gateway entries. Missing detail calls remain unknown. No background polling calls the public services. The site uses the bundled recording and caches recorder archive reads for 300 seconds.

## How the checks work

- **Served models registered:** every gateway `x-flop.registry_model` must match a discovery `modelName`, ignoring case. No slug inference or fuzzy matching is used. An empty served set is unknown.
- **Prices fresh at read:** every source satisfies `effective_at <= gateway response time < expires_at`. Equal start and end times or reversed times fail. Future sources fail. Missing sources are unknown. The site separately evaluates these same timestamps against its displayed clock.
- **Served lists agree:** compare gateway registry names with MCP models explicitly marked `served: true`. Require complete discovery with `availabilitySource: gateway`. Registry-only entries are excluded. MCP uses the gateway for availability, so agreement is not independent confirmation.
- **Registry details:** the detail response must match the discovery name and hash. Its version must also match the gateway registry version when supplied.
- **Trust-root hash:** the discovery hash must occur in the observed trust-root model list. This compares declarations. It does not hash model weights.

Each source is parsed at runtime. Malformed, duplicate, missing or unavailable source data produces unknown results. Raw source text stays in the recording. The separate provider directory count is never substituted for an advertised miner count.

## Prices and history

Gateway model quotes retain decimal strings. The recorded gateway response has no price on each `price_sources` entry. The tool says **individual price: not supplied**, even when a model-level quote exists. The gateway response does not state its currency or token unit, so the tool does not invent one.

MCP `pricePerGflop` values are labelled as declared FLOP per GFLOP. Comparison estimates retain their token count. Quality scores, synthetic price ranges and unmeasured latency fields are not used to rank models or infer a paid price.

History reads at most the latest eight model snapshots from the recorder data branch. Snapshots must pass the recorder schema and content-hash check. Points retain snapshot id, source time, prompt quote, completion quote and source labels. Missing archives stay empty in the API and CLI. The site explicitly labels its bundled recorder observations when the public archive has no points. Closely spaced readings do not establish a daily trend.

## Checks

```sh
pnpm --filter @flop-lab/models check
pnpm --filter @flop-lab/models build
```

Tests replay recorded responses through the shared MCP client. They also cover unavailable sources, empty lists, duplicate entries, malformed prices, timestamp boundaries, registry drift, hash mismatch, truncated discovery, cache expiry, bounded backoff and recorder tampering. The fixture folder contains a successful catalogue run and a separate real gateway timeout.

## What this does not verify

No inference request is sent. The tool does not verify model weights, hardware, miner capacity, uptime, chain consensus, payment execution or paid prices. Address validation checks encoding shape without an SS58 checksum. Public hash agreement is not proof of registration. Source reads are not atomic. Content hashes detect archive changes without proving authorship. Devnet can reset. The site recording is dated evidence and is not a current health claim.
