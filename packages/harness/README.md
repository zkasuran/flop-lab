# FLOP conformance harness

Does the network do what its docs say? The harness checks documented FLOP claims
against public responses. Each result keeps the claim, observed evidence and source
time. A failure must reproduce before the harness marks it FAIL.

## Quick start

From the repository root with Node 22 and pnpm. This checks the gateway contract
and writes `last-run.json` and `last-run.md` in the current directory:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/harness build
node packages/harness/dist/cli.js run --only gateway-contract --max-requests 8 --max-flop 0
```

## Claims and evidence

The catalogue covers documented protocol parameters, gateway contracts, model
discovery, settlement arithmetic, pagination, error handling and advertised MCP
tool inputs. Each claim carries a quoted source or schema path. JSON-compatible
YAML 1.2 keeps catalogue parsing small and deterministic.

The expanded inventory records every body block from the docs index and the pinned
yellowpaper. The capture at `2026-11-05T22:44:20.746Z` read 38 docs pages and the
paper at `2a2cc8218048a2933071bb2f45d75335560e39d8`. It retained 2609 prose,
table and example blocks. Source fixtures preserve original bytes after JSON
decoding. Each block has its raw source line range and a quoted text projection.
HTML table cells are separated with ` | ` for readability.

This is a source-block inventory. A paragraph can contain several assertions.
Examples and context remain visible so keyword filtering cannot hide coverage
gaps. It is not a claim that automatic extraction understands every sentence.
Unmapped blocks carry a reason and the evidence needed. Some need another tool,
a runtime, a worker or a write-enabled test rather than a public read.

`claims/extracted.yaml` adds exact paper parameter identifiers, quoted docs
parameters and hosted session boundaries. Parameter checks reuse the spec tool's
exact unit arithmetic. A catalog match verifies agreement between two sources,
not runtime enforcement. Missing rows and incompatible units are UNVERIFIABLE.
The original protocol checks retain their runtime evidence requirements.

```sh
pnpm --filter @flop-lab/harness start coverage --page protocol-parameters
pnpm --filter @flop-lab/harness start run --profile ci --max-flop 0
pnpm --filter @flop-lab/harness start history --only gateway-contract
```

`coverage` without `--page` emits the whole offline inventory. `history` reads the
recorder's public `data/index.json` once with an 8-second timeout and a 4 MB ceiling.
It preserves every run's source and measurement time. Missing claims stay gaps.
It never carries a previous PASS forward. An absent data branch is an empty
history, not a successful conformance run. The recorded branch lookup returned
HTTP 404. Recorder seed fixtures test populated history without claiming a live
archive exists.

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

The `full` profile caps network attempts at 80. `ci` caps attempts at 12 and selects
gateway shape, price-source lifetime, the reported audit rate, hosted read-only
inventory and the catalog's block reward. `--max-requests` can lower a profile's
ceiling. It cannot raise it. An exhausted run keeps unexecuted checks SKIPPED.

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

This runs the read-only checks with a request ceiling of 80. It writes raw dated
per-request fixtures and splits compact results under `fixtures/coverage/` to
keep files below 200 KB. The compact snapshot marks truncated response and
observation excerpts and references each raw fixture. `loadCoverageRecording()`
reassembles and validates that archive. The older `last-run.json` remains a dated
historical recording. A normal `run` still emits a single JSON report for `report`.
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

## Recorded-run website

The `/harness` page reads the committed `packages/harness/last-run.json`. It labels
the run as last known and shows its original time, source URLs and available network
identifiers. Missing genesis hashes and spec versions stay unavailable.

Filter the catalogue by outcome or boundary. Search by claim, expected value or
reason. Open a claim for its quoted source, expected predicate, observed attempts
and request excerpts. Each row can copy a bounded workspace command. Commands run
against the current devnet, so their results can differ from the recording.

After a checkout and `pnpm install --frozen-lockfile`, run the site locally:

```sh
pnpm --filter web exec next dev --port 3320
```

Open `http://localhost:3320/harness`. To refresh the page's recording, run
`pnpm --filter @flop-lab/harness record`, review the fixtures and commit the output.
The page makes no FLOP API calls. Motion follows reading order, filtered rows,
the detail drawer and recorded request durations. Reduced motion keeps the final
values and disables travel.

The harness package check includes the recorded site-view tests. Browser evidence
for this milestone is retained with its PR.

## What this does not verify

- Exhaustive sentence-level interpretation. Coverage counts source blocks and explicit predicates.
- Runtime enforcement from source catalog agreement or continuous health from historical runs.
- Inference correctness, miner performance, receipt signatures or cryptographic proofs.
- Simulated TEE answers or placeholder receipt fields as evidence of verification.
- Runtime constants that the public MCP surfaces do not expose with a version.
- Network identity, consensus finality or the correctness of indexer data.
- Atomic consistency across separate gateway, discovery and paginated reads.
- A valid on-chain agent id or active session key when no observed example exists.
- Tools that generate private material. These are excluded from the catalogue.
- On-chain writes, throwaway-wallet funding, actual spend limits or fund recovery.
- Responses exceeding the recording limit or a service's deployed source revision.
