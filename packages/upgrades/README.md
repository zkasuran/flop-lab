# Upgrade tracker

What changed in the runtime and in the spec? `flop upgrades` compares pinned yellowpaper revisions, lists changed Appendix A values and merges them with dated package releases. It also reads explicit version observations from a recorder index. Every event keeps its source, reception time and date meaning.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/upgrades build
node packages/upgrades/dist/cli.js --kind spec
```

The default is an offline replay of recorded public responses. To use the suite command after building the CLI:

```sh
pnpm --filter @flop-lab/cli build
node packages/cli/dist/cli.js upgrades --json
```

Open `/upgrades` for a filterable timeline. Expand an entry for exact before/after section text and parameter values. Download its sourced JSON without making another public request.

## Read a bounded live window

```sh
node packages/upgrades/dist/cli.js --live --json
node packages/upgrades/dist/cli.js --live --from 70e691c758e53eed17a016a02b0a2ae1200d3744 --to 5730f4b6cf56fa88bb93bbda272dc449b2f77b17 --kind spec --diff
node packages/upgrades/dist/cli.js --index packages/recorder/test/fixtures/seed/index.json --kind runtime
```

`--from` and `--to` require full immutable SHAs and `--live`. Put the older commit first. The default live window uses the latest three commits that changed `yellowpaper.md`. It fetches their paper and CHANGELOG plus up to eight decision files found in GitHub's comparison. This does not scan every historical commit. A file-list cap becomes an explicit gap.

`--kind spec|sdk|runtime|docs` selects a source. `--search text` matches titles, names and quoted before/after text. `--diff` prints full section text in terminal mode. JSON always includes the full selected events. A missing source produces a dated gap. Invalid CLI options exit nonzero.

## What dates mean

- Spec: GitHub committer time of the destination revision. Links pin both commits. Unnumbered headings are scoped to their parent and preceding numbered section.
- SDK: npm's per-version publication date for `@flop-labs/client`, `contracts`, `sdk`, `cli` and `pi`. Python `flop-sdk` uses the earliest PyPI artifact upload per release. This is publication history, not a compatibility report. Yanked Python releases retain that label.
- Runtime: explicit `specVersion` fields from a recorder index. The first point is a baseline. Later changes require matching source and known matching genesis with no missing point between them. The event time is the observation time. The actual upgrade time remains unknown.
- Docs: a `Last updated` page label, retaining day precision. Otherwise use a valid HTTP `Last-Modified`. Neither is a verified content edit. A date-only event sorts at the start of its UTC day and still displays only the date.

The runtime adapter recognizes `health.runtimeVersion.specVersion`, `health.specVersion`, `stats.specVersion` and `indexer.runtimeVersion.specVersion`. Recorder SDK fields are `health.sdkVersion` and `health.sdk.version`. It never interprets snapshot schema versions or gateway quote versions as runtime versions. The bundled recorder index has no explicit runtime version points.

## Literal comparisons

The parser splits headings outside code fences. It ignores line-ending differences and whitespace at section edges. A renamed section appears as a removal and an addition. Section text is not rendered as HTML.

Changed parameters are rows in Appendix A tables with `Parameter` and `Value` headers. It matches the explicit parameter anchor when present. Comparison is literal: it does not evaluate formulas or convert units. Added and removed values remain distinct from zero. Other parameter mentions remain visible in section text.

## Evidence and cost

The bundled public capture finished at `2026-11-06T03:27:33.844Z`. It made 20 requests in 10444.566705 ms. These are capture measurements, not a latency promise. Raw HTTP bodies, status codes, URLs and reception times are preserved in `fixtures/raw-*.json`. The chunks reassemble through generated `src/data.ts`. JSON escapes preserve original characters. Each chunk is below the repository fixture size limit.

The public reader spaces request starts by at least 500 ms. Successful responses cache for 15 minutes within a reader instance. It caps a run at 50 requests. A request has a 20 second timeout and a 4 MB body limit. HTTP 429 and 5xx get at most two retries with increasing backoff. A Retry-After over 10 seconds ends that source read instead of retrying early. The CLI does not persist a cross-run cache. The static site replays its bundle with no public fetch.

## Importable API

```ts
import { recordedReport, filterEvents, capture, buildReport } from "@flop-lab/upgrades";

const report = recordedReport();
const parameters = filterEvents(report.events, "spec", "tx_fee_burn");
const current = buildReport(await capture());
```

`diffSpec` compares two revisions. `runtimeHistory` accepts a validated recorder index and evidence for its source. `createReader` accepts an injected fetch, clock and sleep for deterministic replay. Keep the same reader instance to reuse its cache.

## Checks

```sh
pnpm --filter @flop-lab/upgrades check
pnpm --filter @flop-lab/upgrades record
```

`record` intentionally refreshes the raw fixture bundle from public sources. Tests cover the saved responses, literal changes, missing and hostile inputs, absent runtime data, reset boundaries, timestamp validation, filtering, cache expiry and retry ceilings.

## What this does not verify

The tool does not verify deployed runtime versions, governance votes, upgrade authorization, chain finality, private runtime source or SDK compatibility. It does not write transactions. A spec edit or a registry release is not a runtime deployment.

The history window is bounded. GitHub comparison discovery can omit decisions that changed and then reverted within the window. npm versions removed from the registry are not reconstructed. Empty Python releases lack artifact dates. Docs page labels and HTTP metadata do not establish content history. Parameters outside the recognized Appendix A tables are not classified automatically. Quoted spec changes retain draft status and do not prove implementation.
