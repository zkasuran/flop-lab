# @flop-lab/harness

Check public FLOP devnet claims against dated responses. Use this before integrating
a gateway response or reporting a disagreement to the maintainers.

The catalogue covers documented protocol parameters, gateway contracts, model
discovery, settlement arithmetic, pagination, error handling and advertised MCP
tool inputs. Each claim carries a quoted source or schema path. JSON-compatible
YAML 1.2 keeps catalogue parsing small and deterministic.

## Run

From the repository root with Node 22 and pnpm:

```sh
pnpm install
pnpm --filter @flop-lab/harness run check
pnpm --filter @flop-lab/harness run build
pnpm --filter @flop-lab/harness start list
pnpm --filter @flop-lab/harness start run --only gateway-contract --max-requests 8 --max-flop 0
```

`start` runs the CLI from source. The built binary is `flop-harness`:

```sh
node packages/harness/dist/cli.js run --class read-only --max-requests 80 --max-flop 0
```

The source command writes `last-run.json` and `last-run.md` in the package directory.
The built command writes them in the current directory. Use `--out` and `--markdown`
to select existing output directories. JSON contains the exact request and raw
response for each HTTP attempt. Markdown shows expected and observed values.

Exit codes: `0` completed checks, `1` confirmed failures, `2` invalid input and `3`
incomplete selected checks. A complete run can contain unavailable checks.

```ts
import { runHarness, renderMarkdown } from "@flop-lab/harness";

const report = await runHarness({
  only: "settlement-conservation",
  maxRequests: 20,
  maxFlop: "0",
});
console.log(renderMarkdown(report));
```

## Interpret results

- **PASS**: the written predicate held for the observed responses.
- **FAIL**: the same predicate failed on a fresh repeat. Both attempts are retained.
- **UNVERIFIABLE**: missing data, transport failure, missing prerequisites or an
  unsupported check prevented a conclusion.
- **SKIPPED**: selection, request budget or spend opt-in excluded the check.
- **FLAKY**: a failure did not reproduce. Its status is `UNVERIFIABLE`, never `FAIL`.

MCP input schemas describe requests, not response truth. Generic probes check
schema-valid inputs and validate `structuredContent` against an output schema only
when the server advertises one. Text content does not replace structured output.
Plain-text missing-resource replies are unavailable. An empty settlement tape
does not pass conservation. An empty offer list cannot verify offset movement.

Settlement arithmetic uses integer raw units. The runner reads every page and
requires a stable total, no duplicate channels and complete row coverage. There is
no snapshot token. A changed total or overlapping pages makes coverage unavailable.
Discovery checks registered models separately from gateway-served models.
The price-source lifetime check tests the recorded catalogue convention. It does
not promote that observation to a runtime guarantee or check current price validity.

Every run includes observation times and source URLs. Genesis hash and spec version
are explicitly null when the public surfaces do not establish them. The health
endpoint's network name alone does not authenticate devnet.

## Limits and caching

`--max-requests` is a global ceiling on physical HTTP attempts, including retries
and network metadata reads. Zero disables network access. Reads are serialized per
host with a 500 ms minimum interval. The shared MCP client performs one bounded
retry with backoff on transient failures. Gateway reads retry once on 429 or 5xx
and honour Retry-After up to 30 seconds. Responses have a 196608-byte ceiling and a
20-second timeout. Redirects and unlisted endpoint URLs are refused.

Successful equivalent reads are cached for 30 seconds within one run. Cache hits
retain the original evidence references and observation times. Confirmation clears
the cache. No cache persists between runs. A budget exhausted during confirmation
cannot produce a confirmed failure.

`--max-flop` accepts exact nonnegative decimal FLOP with at most 18 fractional digits.
Spend-class catalogue entries require both `--allow-spend` and a positive ceiling.
This release has no verified public write adapter. Opt-in reports the missing
throwaway-wallet, faucet/genesis and write-transport prerequisites as unavailable.
It submits no extrinsics and spends no funds. Recovery and session exhaustion are
listed with their expected outcomes so missing coverage remains visible.

## Record fixtures and the site snapshot

```sh
pnpm --filter @flop-lab/harness record
```

This runs the read-only checks with a request ceiling of 100. It writes raw dated
per-request fixtures and a compact `packages/harness/last-run.json`. The compact
snapshot marks truncated response and observation excerpts and references each
raw fixture. It is suitable for the site and can be passed to `report`.
Review fixture and catalogue changes before committing them. Live devnet data can
change or disappear after a reset. Recorded responses are not current measurements.

The default tests replay these recordings through the shared MCP fixture client.
They also corrupt values, empty lists and budgets to check failure paths. To enable
the opt-in gateway test, run `FLOP_LIVE=1 pnpm --filter @flop-lab/harness run check`.
It skips cleanly when the network is unavailable.

## Add a claim

1. Add an entry to a `claims/*.yaml` array. Use a unique lowercase hyphenated id.
2. Record `source.url`, an exact `source.quote` or schema path and `source.measuredAt`.
3. State the predicate in `expected`. Set `kind` and `risk` explicitly.
4. Use a supported `check` or implement a predicate in `src/checks.ts`. Add its name
   to the catalogue schema. Missing prerequisites must return `UNVERIFIABLE`.
5. Record a real response. Add a hostile fixture mutation that breaks the predicate
   and an empty-input case. Keep public function examples and the README current.

The maintainer-only `scripts/catalogue.ts` regenerates advertised tool claims and
the initial design catalogue. It overwrites those catalogue files. It is separate
from normal runs so a remote schema change cannot silently change the expectations.

## Draft a bug report

```sh
pnpm --filter @flop-lab/harness start report mcp-knowledge-get --input last-run.json
```

Only reproduced failures with evidence can become drafts. The command uses `gh api`
to resolve the current `flop-labs/flop-core` default-branch SHA. The source repository
is private. When the lookup fails, the draft records the revision as unavailable
with a reason. It separately resolves and labels the public tracker's issue-form
revision for the publishing gate. That SHA is not an implementation or deployment
revision. A source SHA does not identify the deployed service.
The draft includes expected vs observed values, exact request excerpts, a reproduction
command and unknowns. Service bugs go to `https://github.com/flop-labs/network`.
Search existing issues and PRs before publishing a draft. Issue #23 already covers
the missing agent-pack tools and #80 covers the private source repository.

## What this does not verify

- Inference correctness, miner performance, receipt signatures or cryptographic proofs.
- Simulated TEE answers or placeholder receipt fields as evidence of verification.
- Runtime constants that the public MCP surfaces do not expose with a version.
- Network identity, consensus finality or the correctness of indexer data.
- Atomic consistency across separate gateway, discovery and paginated reads.
- A valid on-chain agent id or active session key when no observed example exists.
- Tools that generate private material. These are excluded from the catalogue.
- On-chain writes, throwaway-wallet funding, actual spend limits or fund recovery.
- Responses exceeding the recording limit or a service's deployed source revision.
