# Spec reader

What does the yellowpaper say about this, next to the public value? Read the pinned full document. Search headings, glossary terms and parameter names. Inspect Appendix A beside the spec differ's dated knowledge-catalog observations. Follow Appendix E's explicit public issue citations with recorded issue states.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install --no-frozen-lockfile
pnpm --filter @flop-lab/yellowpaper build
node packages/yellowpaper/dist/cli.js parameter channel_dispute_window_blocks --json
```

## Commands

```sh
node packages/yellowpaper/dist/cli.js search dispute window
node packages/yellowpaper/dist/cli.js section 3.5
node packages/yellowpaper/dist/cli.js issues --json
node packages/yellowpaper/dist/cli.js parameter channel_dispute_window_blocks --live --json
```

`index` lists all headings. `section` accepts a section number or heading anchor. `search` matches every literal query word, ignores case and treats underscores as spaces. Names rank before definition-only matches. Empty library queries return index order. No fuzzy match changes a parameter name.

The default performs no network requests. `--live` uses `@flop-lab/spec`'s runtime reader and the shared MCP client. Its cache TTL is 60 seconds, minimum request spacing is 500 ms and each read has one retry for retryable failures. Failed catalog reads remain unavailable. They do not turn into measured zeroes. Issue states remain recorded when `--live` is used.

## Library

```ts
import { recordedReader, recordedIssues, searchIndex, issuesFor } from "@flop-lab/yellowpaper";

const reader = recordedReader();
const matches = searchIndex(reader.search, "dispute window");
const item = reader.openItems.find((row) => row.id === "E.53");
const discussions = item ? issuesFor(item, recordedIssues()) : [];
```

`buildReader(paper, report)` accepts another validated pin and its matching spec-differ report. It renders GFM tables and code, provides stable heading anchors and links section references. Raw HTML cannot introduce scripts, images or active attributes. Relative links point into the pinned repository. Unknown local anchors retain a source link and appear in `unresolvedLinks`.

## Sources and refresh

The paper is reassembled from `packages/spec/fixtures/paper-*.json`. The raw response, source URL, line offsets, commit and measurement time stay in those recordings. This package does not duplicate the document. Catalog values come from `recordedReport()` in `@flop-lab/spec`, which uses the `protocol-params` knowledge concept. The knowledge package is not required.

Public issue recordings live in `fixtures/issues.json`. Refresh them with:

```sh
pnpm --filter @flop-lab/yellowpaper record
```

The recorder makes spaced public GET requests for the explicit `yellowpaper#NNN` citations in Appendix E and its public erratum. It stops on HTTP failure. It does not poll. Each result retains its raw response and source. The batch start time is its conservative observation timestamp.

The mirror says bare `#NNN` references are internal engineering tracker IDs. The reader never turns those into public issue URLs. Exact E.N mentions in a recorded public issue title are labeled related discussions, not blocking issues. Missing public mappings have no inferred state. Appendix E's own status is separate from an issue's state.

Display punctuation is normalized to short hyphens. Raw recordings preserve original text. Equations and diagrams retain their source notation; no math engine executes them.

## Checks

```sh
pnpm --filter @flop-lab/yellowpaper check
pnpm --filter @flop-lab/yellowpaper build
```

Tests cover the full recorded document, local link targets, line anchors, exact parameter evidence, issue mapping, search, empty input and hostile markup.

## What this does not verify

Catalog agreement does not verify deployed runtime storage. The catalog's own provenance warnings remain in the report. A current public issue state does not establish that a specification item was resolved or implemented. Internal tracker state and private source are unavailable. This reader does not execute proofs, validate equations, verify inference or submit transactions. The pinned paper and recorded catalog can differ from today's deployment.
