# Security invariants

Which security invariants and failure cases can be checked from outside? `flop-invariants` parses the yellowpaper's security rules and actor failure matrix. It links each rule to a concrete violation signal, an existing suite check or a reason the rule is not observable from outside.

From the repository root:

```sh
pnpm install --no-frozen-lockfile
pnpm --filter @flop-lab/invariants build
node packages/invariants/dist/cli.js run --json
```

## Read the result

- `OBSERVED`: at least one scoped check matched. Read the remaining check results and boundary.
- `MISMATCH`: a scoped check found inconsistent public records or a catalog difference. This is not a proven protocol violation.
- `NO_DATA`: a mapped check lacks usable evidence. Empty samples never pass.
- `UNOBSERVABLE`: no current suite check covers the row. The report explains the missing evidence.

No state means that a complete security invariant has been verified. A source row marked GAP, OOS, ASSUMED or REMOVED keeps that label. Each table row retains every original cell, its full quote and exact source lines. The normative degraded-state policy and validator penalty table are included. Non-normative rationale is excluded.

## Commands

```sh
node packages/invariants/dist/cli.js catalogue --json
pnpm --filter @flop-lab/cli build
node packages/cli/dist/cli.js invariants run
```

`run --input file.json` replays an object with `verifier`, `indexer`, `harness` and `spec` fields. These contain the native bundle, snapshot, HTTP capture array and spec recording map returned by `recordedInputs()`. Missing fields produce no data. Inputs are limited to 2000000 bytes. Invalid native data cannot support an observation. The tool does not follow URLs in an imported file.

Exit codes: `0` means a report was generated without a scoped mismatch. `1` means at least one scoped mismatch. `2` means invalid CLI arguments or an invalid input envelope. Exit `0` is not a security verdict.

## Library

```ts
import { recordedCatalogue, recordedInputs, runChecks } from "@flop-lab/invariants";

const rules = recordedCatalogue();
const report = await runChecks(recordedInputs());
console.log(
  rules.find((rule) => rule.id === "M1"),
  report.counts,
);
```

Checks call `verifyEvidence`, `auditSnapshot`, the harness's `checkClaim` API and the spec differ's parser and comparison functions. Predicates are imported from their packages. The harness replays exact recorded requests with the original claims through its existing bounded transport and cached context. Replaying the same capture is not independent failure confirmation.

## Evidence and bounds

The paper is pinned to `2a2cc8218048a2933071bb2f45d75335560e39d8`. Original source slices and public responses are retained in the suite:

| Input              | Raw recording                                                             | Capture time                                           |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Sections 11 and 13 | `packages/harness/fixtures/sources/paper-2046.json` and `paper-2301.json` | 2026-11-05T22:44:45.571Z                               |
| Verifier bundle    | `packages/verifier/fixtures/v2-channel.json`                              | Bundle and per-response times in the file              |
| Indexer snapshot   | `packages/indexer-audit/fixtures/devnet.json`                             | Snapshot and per-response times in the file            |
| Harness HTTP       | `packages/harness/fixtures/coverage/run-{1,2,4,5}.json`                   | Per-request source, raw response and time in each file |
| Spec inputs        | `packages/spec/fixtures/{knowledge,stats,transactions,transaction}.json`  | Per-response source and time in each file              |

The report's `evaluatedAt` is the replay time. It does not replace any evidence capture time. The samples are bounded and non-atomic. Devnet resets can remove their records.

Replay makes no network requests. There is no live cache or polling. The immutable recorded inputs are reused until the repository updates them. The underlying harness retains its bounded request budget and cache while its transport reads recordings. Unknown source rows remain unreviewed gaps.

## Checks

```sh
pnpm --filter @flop-lab/invariants check
```

Tests cover source completeness, exact quotes, source drift, malformed inputs, offline execution, native suite contradictions and absence of evidence. A one-unit change in recorded escrow components must produce a mismatch.

## Matrix page

`/invariants` opens on actor failures. Choose another source group to inspect the security invariants, degraded-state rules or penalty table. Search all quotes and filter by scoped result. The grid shows a bounded page of cases with previous and next controls. Each cell opens its exact source, violation signal, missing evidence and dated suite results.

The recheck control reruns the existing suite libraries on the server against the same immutable recordings. Its progress advances when each library completes. It does not refresh the devnet. Download the raw inputs for CLI replay or the displayed report for review. The raw-input download has a five-minute HTTP cache. Replay responses use `no-store`.

To run the production page from this repository:

```sh
pnpm --filter web build
pnpm --filter web exec next start --port 3650
```

Open `http://localhost:3650/invariants`. Keyboard controls and reduced-motion preferences retain the same evidence.

## What this does not verify

This tool does not prove runtime enforcement, finality, payout atomicity, complete historical no-double-settle behavior, inference execution, attestation authenticity or honest validators. It does not execute failure scenarios, formal models, writes or independent re-execution. Catalog agreement is not runtime storage. Public view agreement is not independent confirmation. Unsigned recordings can be edited and rehashed. Gaps in public evidence are not proof that an invariant holds or that a violation occurred.
