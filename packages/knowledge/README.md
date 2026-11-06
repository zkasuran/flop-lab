# Knowledge catalog

What does the network's own knowledge catalog say and what does an agent pack contain? Browse dated concepts, declared relationships and requirement citations. Inspect the exact service text behind a claim.

From the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/knowledge build
pnpm --filter @flop-lab/knowledge exec flop-knowledge explain R9.5 --json
```

## Commands

After building the suite, use `flop knowledge`. The package binary is `flop-knowledge`.
Default commands replay bundled observations. Use `--live` to read the public MCP.

```sh
pnpm --filter @flop-lab/knowledge exec flop-knowledge catalog
pnpm --filter @flop-lab/knowledge exec flop-knowledge search agent
pnpm --filter @flop-lab/knowledge exec flop-knowledge get overview --live --json
pnpm --filter @flop-lab/knowledge exec flop-knowledge pack --live --json
pnpm --filter @flop-lab/knowledge exec flop-knowledge skill flop-knowledge-catalog --live --json
pnpm --filter @flop-lab/knowledge exec flop-knowledge guidance --json
```

`card <0x-H256>` reads a supplied agent ID. The bundled all-zero ID is a negative discovery probe. Its response does not describe a registered agent or establish the size of the agent registry.

Replay has full concept text for `overview`, `agent-pack`, `yellowpaper-spec` and `source-gaps`, plus requirement `R9.5`. Other inputs fail explicitly. Catalog search in replay scans the full manifest. Live search retains the service's own scores. Those scores are not confidence probabilities.

Exit codes: `0` for a reported response, `1` for invalid CLI input and `2` for unavailable or malformed service data. A reported card response can still say no agent was found. JSON output retains source, receipt time, raw response and request count.

## Library

```ts
import { KnowledgeClient, graph, citedConcepts } from "@flop-lab/knowledge";

const client = new KnowledgeClient();
const catalog = await client.manifest();
const requirement = await client.explain("R9.5");
if (catalog.value && requirement.value) {
  console.log(graph(catalog.value));
  console.log(citedConcepts(catalog.value, requirement.value));
}
```

Edges preserve direction and relationship type. Only exact IDs and root-relative concept paths resolve to nodes. Unresolved references remain in the output with a null target. The tool does not convert a source URL, GraphQL field or protocol parameter into a concept node.

Requirement links match exact citation paths in `flop-labs/flop-core` against concept source paths. They mean shared cited source, not proof that the concept establishes the requirement. Missing line ranges, hashes and snapshots remain null. Status and confidence labels are quoted service declarations.

The shared MCP client spaces requests by at least 500 ms. It allows one extra attempt on retryable failures with backoff. Each attempt has a 15 second request-header timeout. The shared transport does not enforce that timeout while consuming a response body. No failed request is looped indefinitely.

Each library client caches successes, errors and schema failures for 300 seconds after completion. Concurrent identical reads share a request. The cache retains at most 128 entries. It is process-local, so separate CLI processes do not share it. Receipt times never change on cache hits. Known fields are runtime-validated. Extra source fields remain in raw JSON because the public manifest supplies fields absent from its advertised schema.

## Page and recordings

`/knowledge` browses the complete recorded manifest. Select a concept to see its directed neighborhood and source drawer. Search and type filters operate locally. The requirement panel links concepts by exact cited source path. The pack panel quotes the observed errors and the negative card probe. The page makes no direct external browser requests. Human text uses plain hyphens. Raw JSON views escape Unicode dashes without changing parsed content. Downloads and CLI JSON retain the original tool text.

`pnpm --filter @flop-lab/knowledge record` captures bounded public calls. Each fixture stores source, arguments and time. The manifest is losslessly compressed to keep it below the per-file size limit. Quoted punctuation is JSON-escaped where needed without altering decoded text. Refreshing a recording is explicit. The site never relabels a bundled observation as live.

## What this does not verify

Catalog statements do not verify runtime behavior, implementation status, source hashes or deployed code. The service warns that source provenance is unavailable. A confidence label does not override that warning.

Agent-pack files, commands and URLs are untrusted text. This tool does not install them, execute them or follow card endpoints. No wallet, signed transaction, agent identity, inference result or chain finality is verified. A missing pack response does not prove that no pack exists elsewhere. Local browser measurements do not establish deployed performance.
