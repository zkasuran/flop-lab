# Watch

How do I get told when the devnet changes? Watch runs local rules over dated public observations. It stores baselines and pending notifications on disk. Use it for operator checks or agent monitoring.

## Quick start

From the repository root with Node 22 and pnpm:

```sh
pnpm --filter @flop-lab/watch build
node packages/watch/dist/cli.js example > /tmp/flop-watch.yaml
node packages/watch/dist/cli.js replay --rules /tmp/flop-watch.yaml packages/watch/test/fixtures/2026-11-06T04-45-55.439Z.json packages/watch/test/fixtures/2026-11-06T04-49-00.280Z.json
```

Install workspace dependencies first with `pnpm install --frozen-lockfile`. The shared CLI is `pnpm --filter @flop-lab/cli exec flop watch --help` after the workspace build.

## Rule file

```yaml
version: 1
pollMs: 60000
maxRequests: 100
rules:
  - id: reset
    kind: devnet-reset
  - id: closing
    kind: challenge-closing
    withinBlocks: 100
  - id: prices
    kind: price-expired
  - id: reachability
    kind: service-down
    service: mcp
    failures: 2
outputs:
  - kind: jsonl
```

Validate with `flop watch check --rules watch.yaml`. Run once with `flop watch run --rules watch.yaml`. Use `--polls 0` to continue until interrupted or the run request budget is exhausted. Set `--state path/to/state.json` to choose a state file. Relative report paths resolve from the current directory.

| Rule                | Decision and suite library                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devnet-reset`      | Recorder reset analysis finds a decrease in the MCP reported head between successful reads. It is a reset signal.                                                                                                                                 |
| `settlement`        | Set `address` to a miner or agent address. MCP validates settlement rows. First successful read is a baseline. Later unseen settlement events for that address alert. Address validation checks encoding shape only.                              |
| `challenge-closing` | Sessions must classify the row as a forced challenge window. An explicit `challengeEnd` must satisfy `0 < challengeEnd - reportedHead <= withinBlocks`. End blocks do not establish finalisation.                                                 |
| `claim-change`      | Set `claim` to a harness claim ID and `report` to a local harness JSON report. Harness validates the report. Only a newer report with a changed status alerts. Missing claims stay unknown. Run the harness separately.                           |
| `price-expired`     | Models validates the gateway response and applies its exact expiry boundary at read time. The deduplication key includes model, address and expiry.                                                                                               |
| `service-down`      | Set `service` to `mcp` or `gateway`. Consecutive transport failures or HTTP 5xx responses trigger an alert. A successful validated probe re-arms it. Invalid data, 429 and a spent request budget are unknown. They interrupt the failure streak. |

Unknown YAML fields, duplicate keys, aliases, duplicate rule IDs and invalid bounds fail validation. Editing a rule resets that rule's baseline. Keep IDs stable across restarts. Observations with repeated or older timestamps are ignored.

## Delivery and recovery

Outputs are `stdout`, `jsonl`, `desktop` and `webhook`. A webhook also needs `url`. At most one of each output kind is allowed. For example:

```yaml
outputs:
  - kind: stdout
  - kind: webhook
    url: https://example.com/flop-events
  - kind: desktop
```

State and the outbox are written atomically before any notification is sent. Each output acknowledgement is persisted separately. Restarting after an acknowledged delivery does not repeat it. A crash after sending but before saving the acknowledgement can repeat a delivery. Webhooks carry a stable SHA-256 `Idempotency-Key` header. Receivers should deduplicate it. JSON lines include the same `deliveryId`.

Webhooks use a timeout and reject redirects. Network failures, 429 and 5xx retry up to three total attempts. Retry state survives restarts. Exponential delay starts at one second. `Retry-After` can extend it up to one hour. Due retries run on the next poll or `flop watch drain --rules watch.yaml`. Other HTTP failures go directly to the dead-letter file. Retries do not make extra source reads.

Failed delivery records append to `<state>.dead-letter.jsonl`. Change that with `--dead-letter path`. Records keep the alert, output, attempts, failure time and error. Inspect them before replaying to a receiver. Dead letters can repeat after a crash between append and acknowledgement; their stable delivery IDs remain the same.

Desktop delivery uses `notify-send` on Linux or `osascript` on macOS without a shell. An unavailable command is recorded as a failed delivery. Native desktop presentation was not exercised during the automated checks.

A state lock prevents concurrent writers. On a forced process termination the lock can remain. Inspect its PID and confirm that process has stopped before removing `<state>.lock`. Corrupt state fails closed. Nothing silently resets the baseline. State holds at most 20,000 event keys per rule and 10,000 pending alerts with a 16 MB file ceiling. Archive the old state and drain pending deliveries before deliberately starting a new baseline. That new baseline can alert on existing expiry or challenge conditions.

## Bounds and recorded evidence

The request ceiling counts physical public-source requests including retries. It applies to one invocation. Restarting creates a new request budget. Polling has a minimum interval of ten seconds and caches each poll for the configured interval. Failures double the next polling delay up to one hour. Each selected source is read once per poll with at most one internal retry. Rules sharing a source share the read.

Settlement and channel reads cover the first 50 rows. They report partial coverage when more rows exist. The watcher cannot recover events that never appeared in its sampled pages or that occurred between polls. Local harness reports must fit the bounded input size. Use a bounded harness profile.

The recordings under `test/fixtures` include raw HTTP responses from `https://mcp.flop.network/mcp` and `https://api.flop.network/v1/models`. The polls started at `2026-11-06T04:45:55.439Z` and `2026-11-06T04:49:00.280Z`. Each measured four physical requests. They are samples from a UTC day, not continuous daily coverage. Replay uses their observation times. It does not advance an invented clock or send notifications.

Run `pnpm --filter @flop-lab/watch check` for strict types, lint, formatting and recorded-data tests. Tests include hostile rules, absent data, exact threshold boundaries, restart delivery, request budgets and a local HTTP receiver. Synthetic mutations of recorded rows exercise transitions absent from live samples. They are not network observations.

## Library

```ts
import { parseRules, createCollector, openWatcher } from "@flop-lab/watch";
const config = parseRules(yamlText);
const collector = createCollector(config);
const watcher = await openWatcher("watch-state.json", config);
try {
  await watcher.accept(await collector.collect());
  await watcher.flush();
} finally {
  await watcher.close();
}
```

## What this does not verify

This does not verify a chain reset, independent consensus, finality, inference correctness, runtime challenge eligibility or a filing deadline. Public sources share infrastructure and are read sequentially. A failed probe measures local reachability at its timestamp, not global downtime or uptime. An expired quote is not evidence that a miner is unavailable. Settlement coverage is partial. A reported head decrease can be indexer lag or rollback. Delivery is at least once across a crash, not exactly once. No wallet, transaction, faucet or inference request is used.
