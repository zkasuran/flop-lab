# MCP contract audit

Do FLOP's MCP tools return what they advertise? This read-only audit checks each safe tool's inputs, compares structured output with its declared schema and retains dated evidence. It also shows which trust material an attestation check still needs.

## Quick start

Run from the workspace root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/mcpaudit build
node packages/mcpaudit/dist/cli.js run --tool flop_knowledge_get --json
```

The last command exits 1 when it reproduces the known contract violation. After the suite build, `node packages/cli/dist/cli.js contracts run --json` delegates to this same binary.

## Commands and API

`flop-mcpaudit run [--json] [--tool <name>]` audits the hosted endpoint. Exit 1 means a contract violation was observed, even if its repeat could not complete. Exit 2 means the audit is incomplete or contains unverifiable or skipped checks. Exit 0 means every selected check passed. A missing output schema is never a pass.

```ts
import { runAudit, schemaFindings } from "@flop-lab/mcpaudit";

const report = await runAudit({ tool: "flop_knowledge_get" });
const violations = report.tools.filter((tool) => tool.status === "VIOLATION");
const errors = schemaFindings({ type: "integer" }, "1", "input");
```

The importable API exports source TypeScript for workspace consumers. The binary is built with tsup. Tests use raw responses recorded from `https://mcp.flop.network/mcp`.

## Probe policy

Discovery runs once. The safe allowlist is independent of `readOnlyHint`. Unknown tools and the material-generation tool are skipped. All advertised tools still have a report row. No wallet, faucet or inference submission is used.

For each allowed tool, the runner validates a minimal request locally. It selects one small schema-valid edge when a different edge is available and sends one locally invalid input. Scalar fields use a small lower bound, empty value or enum endpoint. Object-only tools have no distinct scalar boundary. It does not exhaust every field combination. Known public settlement records seed account and channel lookups. When no seed exists, fixed zero identifiers test absence without inventing a resource.

AJV validates the advertised draft with formats enabled. It neither coerces values nor inserts defaults nor removes properties. `additionalProperties` is enforced exactly where the server declares it. Missing schemas remain unverifiable. A valid input that returns a domain error is not automatically a contract violation.

With structured output, at least one JSON text block must match it. A conflicting JSON text block is a violation. Plain explanatory text is not treated as JSON. The response schema and the text comparison are separate checks.

Each violation is repeated once within the same budget. `confirmed` means the repeat produced the same schema and instance paths. The complete raw reply remains in the fixture. Each observation links its request arguments, trace ids, UTC time, HTTP body size and duration.

## Limits and recorded evidence

The hard ceiling is 149 physical HTTP attempts, including retries and discovery. Requests are sequential with a 500 ms minimum start gap. The shared MCP client backs off on 429 and 5xx with one extra attempt. Each attempt has a 15 second deadline. Bodies are capped at 2 MB. Body size means UTF-8 response body bytes after HTTP decompression. Latency covers the fetch and body read, not request spacing. The full-run duration includes spacing and retries.

There is no cross-run response cache. Its TTL is zero so confirmation requests are fresh. The website uses the committed recording and makes no audit requests on page load. Run the CLI for a new observation.

`last-run.json` was measured on 2026-11-05 at 21:44:20 UTC. It records 96 HTTP attempts and covers the 34 advertised tools: 2 tool rows with violations, 1 pass, 30 unverifiable and 1 skipped. These are tool-level results. Input rejection checks can pass on tools whose output remains unverifiable.

`flop_knowledge_get` reproduces [network #87](https://github.com/flop-labs/network/issues/87). `flop_knowledge_manifest` also returns undeclared fields, including root `updatedAt`, `schema` and `specRecords`. Its complete output was checked, including every concept entry.

Raw fixtures below the repository file limit are JSON. Larger responses are stored as `rawGzipBase64` inside their JSON metadata. Gzip is lossless. `test/fixtures.ts` demonstrates decoding. `pnpm --filter @flop-lab/mcpaudit record` replaces the audit recording with a fresh bounded run. `scripts/references.ts` records Intel and CVE references separately from the MCP request budget.

## Trust material

The inspector reports the trust-root version, snapshot hash, models, per-model TEE platform ids and `dstackVkeys`. It preserves numeric platform ids because the response provides no versioned name mapping. Empty keys cannot verify a dstack quote.

The recorded MCP TCB response cites `INTEL-SA-00219` with release date `2025-12-15`. [Intel's advisory](https://www.intel.com/content/www/us/en/security-center/advisory/intel-sa-00219.html), fetched on 2026-11-05 at 21:44:19 UTC, says original release `2019-11-12` and last revision `2019-11-20`. It concerns SGX with processor graphics. The Intel-assigned [CVE-2019-0117 record](https://www.cve.org/CVERecord?id=CVE-2019-0117) links that same advisory. This mismatch is already tracked in [network #36](https://github.com/flop-labs/network/issues/36).

This TCB metadata is inconsistent with the cited advisory. It is not evidence of current platform security. The inspector compares the supplied id with a dated reference. It does not download a full current Intel PCS collateral set during each audit.

## Checks

`pnpm --filter @flop-lab/mcpaudit check` runs strict types, lint, formatting and offline tests. Recorded output failures, invalid-input acceptance, empty discovery, malformed envelopes, conflicting text, budget exhaustion and Intel date parsing are covered. Live recordings are manual so the offline gate makes no public requests.

## What this does not verify

This is a bounded sample of advertised contracts. It does not cover every argument combination or prove service uptime. No output schema means no output-contract verdict. A matching schema does not establish semantic truth, balances, payment finality, inference quality or cryptographic proof. The simulated quote verifier is not used as attestation evidence. Trust-root contents are not authenticated against a finalized chain state. The public hosted service does not expose its deployed source revision. One material-generation operation remains deliberately uncalled.
