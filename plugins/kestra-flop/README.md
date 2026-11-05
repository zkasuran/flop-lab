# FLOP for Kestra

Read the FLOP devnet and check its listed settlements from a Kestra flow.
The plugin handles JSON-RPC, SSE responses, bounded retries and source timestamps.
Its icon is a neutral list symbol. It is not the FLOP logo.

## Tasks

| Type under `io.kestra.plugin.flop` | Output |
| --- | --- |
| `network.Stats` | Indexed block height, accounts, operators and proofs |
| `settlements.List` | Filtered rows, pagination status and optional ION file |
| `settlements.Verify` | Exact arithmetic and descending block-order results |
| `models.List` | Gateway models and expired source flags |
| `inference.ChatCompletion` | Guarded completion and reported usage, mock-tested only |
| `settlements.NewSettlement` | Polling trigger with a namespace KV cursor |

Network outputs include `measuredAt`, `source` and `requestCount`. Individual rows
also carry the receipt time of their page. `Verify` preserves that provenance and
adds `checkedAt`. `NO_DATA` is distinct from `PASS`.

## Build and install

From the repository root, with Docker installed:

```sh
docker run --rm --name fl-a06-build --memory 3g \
  -v "$PWD/plugins/kestra-flop":/w \
  -v fl-gradle-cache:/root/.gradle -w /w \
  eclipse-temurin:21-jdk ./gradlew --no-daemon check jar
docker run --rm -v "$PWD/plugins/kestra-flop":/w \
  eclipse-temurin:21-jdk chown -R "$(id -u):$(id -g)" /w
```

Copy `plugins/kestra-flop/build/libs/kestra-flop-0.1.0.jar` into the Kestra plugin
directory and restart Kestra. For the Kestra Docker image, mount the containing
directory at `/app/plugins`. Compilation targets Java 21 and Kestra API 1.3.39.
The real-flow check used `kestra/kestra:v2.0.6` with an H2 repository and basic auth.

Paste [examples/observe.yml](examples/observe.yml) into the Kestra flow editor:

```yaml
id: flop_observe
namespace: company.flop
tasks:
  - id: stats
    type: io.kestra.plugin.flop.network.Stats
  - id: tape
    type: io.kestra.plugin.flop.settlements.List
    maxResults: 100
    store: true
  - id: verify
    type: io.kestra.plugin.flop.settlements.Verify
    settlements: "{{ outputs.tape.rows }}"
    failOnMismatch: true
  - id: models
    type: io.kestra.plugin.flop.models.List
```

No FLOP key is needed for this flow. In Java, the importable client is
`new FlopClient(runContext, null, null)`. Use
`client.call("flop_get_stats", Map.of(), 10)` for a dated observation.

## Bounds and failure handling

- `settlements.List` accepts `miner`, `agent`, `model`, `sku`, `tier`, `offset`
  and `maxResults`. The limit is 1 to 10000. Check `truncated` before treating a
  result as the full tape. A moving offset feed is not an atomic snapshot.
- `store: true` writes the returned rows to Kestra internal storage as ION.
- `Verify` checks `minerPaid + unusedEscrow + burned = escrow` with BigInteger.
  Amounts must be nonnegative integer strings. Blocks must be non-increasing.
  `failOnMismatch: false` returns the FAIL list without failing the task.
- Read calls have at most three attempts, a per-client 250 ms minimum gap and
  exponential backoff on network errors, HTTP 429 and HTTP 5xx. Retry-After is
  honored. A delay above 30 seconds ends the call rather than retrying early.
- The per-client cache TTL is 10 seconds for stats and models. Settlement reads
  and pre-chat discovery are uncached. Separate tasks create separate clients.
- Connect timeout is 10 seconds. Read idle timeout is 30 seconds. Redirects are
  disabled. Automatic retries inside the Kestra HTTP transport are disabled.

## Trigger

Use [examples/watch.yml](examples/watch.yml). The first poll records the newest
block and event keys without starting a flow. Later polls emit newer blocks and
unseen keys at the cursor block. Deduplicate by `channelId`, `settledBlock` and
`eventIndex` downstream. The interval must be at least `PT10S`.

The cursor key follows Kestra's `namespace_flowId_triggerId` convention. It has no
TTL. Execution-creation failure leaves it unchanged. A rate limit or server
outage skips the poll. A backward tape or insufficient `maxResults` fails with
the cursor retained. Check for a devnet reset before removing the cursor.
The KV update and scheduler handoff are not atomic. Backfills below the cursor
are not detected. This is not an exactly-once delivery guarantee.

## Gateway key and price guard

`inference.ChatCompletion` is **not run against the live gateway**. Set
`apiKey: "{{ secret('FLOP_API_KEY') }}"` through Kestra secrets. It is sent only
on the paid request. Set `model`, `prompt`, `maxTokens`, `maxPricePerGflop` and
`maxCostFlop`. Both price limits are decimal strings.

The task accepts only an explicit optional source extension with a decimal
`price_per_gflop` and `price_unit: FLOP/GFLOP`. The source must already be effective
and remain unexpired for more than one second. This extension is tested with
synthetic data. The recorded public `devnet-nominal` sources do not contain it.
The task therefore refuses those sources. It does not convert token pricing
into GFLOP pricing. The cheapest valid source must be within `maxPricePerGflop`.
This discovery check does not pin a miner or bind the final price.

`maxCostFlop` must be positive. It is sent as the gateway's `max_cost_flop` field.
The plugin sends paid chat once. Do not add a Kestra task retry without resolving
the previous outcome: a timeout does not prove that no work or charge occurred.

## Verification evidence

The fixture tests replay the shared MCP bytes and a dated raw model feed.
They cover hostile inputs, paging, ION round trips, empty data, price refusal,
HTTP retry counts and cursor recovery. Documentation examples parse as YAML flows.
`check` includes Kestra's `lintPluginDocs`.

On 2026-11-05, the real read-only flow `3F4DXszdAcK2iyIVBRarwv` completed on
Kestra 2.0.6. It returned 100 settlement rows and checked their arithmetic as PASS.
It made three HTTP requests. This was a bounded tape read, not a full-chain audit.
The stats task's first attempt took `PT0.872927S`, measured by Kestra execution
history. This single observation is not a latency promise.

The trigger test first recorded its live position. A controlled local cursor
replay then produced execution `4zj34yO7Pkz0q4Vk9BkTxQ` with one real settlement.
This does not claim that a new settlement arrived during the test. Chat execution
`40uGBC9bgPJodB61PVCikZ` used a local mock only.

## What this does not verify

The plugin does not verify inference, proofs, signatures, chain inclusion,
finality or indexer truth. Arithmetic checks apply only to the supplied rows.
Model freshness uses the worker clock. Nominal sources do not establish a
GFLOP price. Live gateway chat, gateway cost enforcement and atomic trigger
delivery remain unverified. The devnet can reset.
