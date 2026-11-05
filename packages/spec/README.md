# Spec drift

Does the running devnet match its yellowpaper? `flop-spec` compares a pinned paper with dated public catalog values and indexed call names. It shows the quoted evidence behind each result. Catalog agreement is not proof of deployed runtime state.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install --no-frozen-lockfile
pnpm --filter @flop-lab/spec build
node packages/spec/dist/cli.js diff --section A
```

## Commands

```sh
node packages/spec/dist/cli.js diff --json
node packages/spec/dist/cli.js params
node packages/spec/dist/cli.js calls
node packages/spec/dist/cli.js diff --section H
node packages/spec/dist/cli.js diff --live --json
pnpm --filter @flop-lab/cli build
node packages/cli/dist/cli.js spec params --json
```

The package exposes `flop-spec`. The suite exposes `flop spec` after its binaries are built. Exit status is 1 when any selected row is DRIFT. Invalid arguments or an incomplete live collection return 2 unless a selected DRIFT already requires 1.

The default is an offline replay. `--live` reads the hosted MCP against the same paper pin. It never refreshes the paper silently. All JSON reports include the full paper commit, comparison time, individual source times and warnings.

## Evidence model

The recording pins `flop-labs/yellowpaper` at `2a2cc8218048a2933071bb2f45d75335560e39d8`. The raw paper is split at line boundaries into small JSON envelopes. Reassembly rejects gaps and mixed pins. Appendix A includes enforced parameters, reference parameters and summary rows. Appendix G preserves explicit pallet names and ordered argument names. Abbreviations and logical interfaces remain incomplete. Appendix H preserves the full informative status text.

The public `money-path-v1.json` and `wire-format-v1.json` files supply vector cases, pending drafts and wire families. Their inputs, status and expectations stay quoted. Locating them is not executing them. A wire family can contain several nested examples. The money-path file also declares its own older source commit; the raw record preserves that declaration.

The runtime view reads `flop_knowledge_get` with `id_or_path: protocol-params`, `flop_get_stats` and `flop_indexer_query`. It introspects `Transaction` before sampling top-level transactions and looking up one transaction by hash. Stats provide dated context. They do not establish parameter values or implementation status. Positional transaction arguments do not establish argument names. Nested batch contents are not treated as independently observed calls.

The catalog warns that repository sources are not mounted beside it. Its values are source claims. No public runtime metadata is part of this recording.

## Results

| Result | Meaning |
| --- | --- |
| MATCH | Exact identifier and comparable value agree. For a name-only call entry, the exact fully qualified name was seen. |
| DRIFT | Both sides provide different values for the same exact parameter identifier and comparable unit. |
| SPEC_ONLY | A parameter is absent from the available catalog or a vector has no runtime execution record. |
| RUNTIME_ONLY | An observed catalog identifier or top-level call has no parsed spec entry. |
| UNOBSERVABLE | Evidence cannot settle the comparison. Each row names the evidence needed. |

Names are case-sensitive. There is no fuzzy matching. A small documented map in `src/runtime.ts` maps known indexer pallet spellings such as `computeChannel` to `compute_channel`. Method spellings are not converted.

Integer grouping underscores are removed. Fixed decimal values use exact integer fractions. The explicit unit table converts FLOP to its base unit, time units to milliseconds and percent/ppt/ppm/ppb to a common ratio. Blocks never become seconds. Unknown units stay distinct. Unknown expressions are exact strings. The generated catalog retains YAML scalar quotes; matching outer quotes are removed while the raw quote stays available. Numeric comparison never passes through a JavaScript floating-point number.

## Library

```ts
import { recordedReport, recordedSpec, createRuntimeReader, compare } from "@flop-lab/spec";

const offline = recordedReport();
const read = createRuntimeReader();
const { runtime } = await read();
const fresh = compare(recordedSpec(), runtime, {
  mode: "live",
  at: new Date().toISOString(),
});
console.log(offline.sha, fresh.counts);
```

The reader memoises a result for 60 seconds, including partial failures. It uses the shared MCP client's request spacing and one retry with backoff on transient failures. It samples at most 100 top-level transactions. There is no polling loop. A new CLI process starts with an empty live cache. Offline recordings are immutable snapshots with their original dates, not a freshness cache.

## Refresh and checks

```sh
pnpm --filter @flop-lab/spec record
pnpm --filter @flop-lab/spec check
FLOP_SPEC_LIVE=1 pnpm --filter @flop-lab/spec check
```

The recording script pins the commit in source and saves raw response text, source URL and reception time. Fixtures are capped below 200 KB per file. Review changes before accepting a new recording. Live tests skip when the catalog is unavailable. Normal checks use the bundled real data plus hostile and empty inputs.

## What this does not verify

This does not verify deployed storage constants, runtime metadata, execution of test vectors, implementation-status claims, finality of the indexed sample or completeness of Appendix G. A call missing from a bounded sample is not absent from the runtime. A catalog mismatch is not proof of a consensus defect. A MATCH is not a safety verdict. No wallets or write transactions are used.
