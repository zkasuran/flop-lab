# FLOP settlement verifier

Inspect what public settlement data supports. Save the evidence and replay the same checks offline. A passing arithmetic check does not mean inference was honest.

## Run

From the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/verifier build
node packages/verifier/dist/cli.js --help
node packages/verifier/dist/cli.js bundle packages/verifier/fixtures/channel-1.json --json
node packages/verifier/dist/cli.js tape --limit 20
node packages/verifier/dist/cli.js channel 0xa5d0a1722a5c7b8b86d7489ff1e76d0c3eb0a72e39e9c47edee1681ef766deec --out evidence.json
```

The package exposes the `flop-verify` binary. The repository commands above invoke its built entry directly. The example channel is from a dated devnet fixture. A devnet reset can remove it. `--out` creates a new file and refuses to overwrite an existing one. `--json` prints machine-readable results. Offline replay never follows URLs in a bundle.

Exit codes: `0` means every executed check is PASS or NOT_APPLICABLE. `1` means at least one FAIL or invalid CLI input. `3` means UNVERIFIABLE with no FAIL. The recorded channel command exits `3`. An empty tape also exits `3`. Tape mode executes only escrow and display-ratio arithmetic. Its `0` is not a full verification result.

## Library

```ts
import { EvidenceFetcher, verifyEvidence } from "@flop-lab/verifier";

const fetcher = new EvidenceFetcher();
const evidence = await fetcher.channel(channelId);
const report = await verifyEvidence(evidence);
console.log(report.exitCode, report.checks);

// The same verifier runs in a browser without a network request.
const offlineReport = await verifyEvidence(JSON.parse(savedJson));
const tape = await fetcher.tape(20);
```

Every check names its claim, inputs and observation ids. Status is `PASS`, `FAIL`, `UNVERIFIABLE` or `NOT_APPLICABLE`. Missing inputs are unverifiable. Malformed or contradictory inputs fail. A failed bundle hash stops further checks.

## Checks

| Id                    | Claim and required data                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bundle-integrity`    | Schema and SHA-256 hashes agree. Requires the complete bundle. Does not authenticate its author.                                                               |
| `settlement-record`   | Exactly one row in the captured pages matches the channel id.                                                                                                  |
| `escrow-conservation` | `minerPaid + unusedEscrow + burned = escrow`. Requires unsigned integer strings in raw units. Uses BigInt.                                                     |
| `display-price-ratio` | The written price is `minerPaid / aggregateGn`, exactly or truncated to its written fractional precision. Uses integer arithmetic.                             |
| `channel-consistency` | The channel and tape agree on escrow, payment, burn, work, parties and market.                                                                                 |
| `price-consistency`   | The agreed historical GFLOP price justifies the payment. Unverifiable without a G_n conversion, per-turn compute and the agreement.                            |
| `model-registry`      | Reported hashes agree with captured discovery and trust-root membership. Checks measuredRoot when enforcement is enabled.                                      |
| `settlement-event`    | Kind, cooperative flag, amounts, block and extrinsic references agree across indexed views. Requires a successful indexed transaction for this channel.        |
| `assurance-tier`      | Tier agreement is checked. Authentication remains unverifiable without verified signatures and an appraisal chain.                                             |
| `challenge-window`    | Rejects settlement after the captured head or a deadline before settlement. Exact expiry remains unverifiable without the historical runtime constant.         |
| `merkle-inclusion`    | Unverifiable without authoritative leaf/node encoding and an authenticated root. A published `merklePath` does not establish encoding.                         |
| `tee-quote-digest`    | Unverifiable without raw quote bytes, documented hashing and independent authentication. Not applicable to a captured Soft channel with no HTLC link or quote. |

### Price semantics

The [glossary](https://docs.flop.network/docs/core-terms), read on 2026-11-05, defines G_n as:

> the unit by which verified miner work is weighted when the 75% miner block-reward pool is distributed.

[Tokenomics](https://docs.flop.network/docs/tokenomics-basics), read on the same date, describes the miner share as:

> Distributed by verified G_n contribution

Neither page gives an invertible conversion from the indexed `aggregateGn` to GFLOPs. Treating the tape's price ratio as an agreed compute price would be circular. The separate display-ratio check deliberately makes the smaller claim.

For a price with `d` fractional digits let `scale = 10^d` and let `p` be the price with its decimal point removed. We test `0 <= minerPaid * scale - p * aggregateGn < aggregateGn`. With no fractional digits we require exact equality. The accepted display convention is nonnegative truncation. Changing the service's display convention requires a versioned check update. This arithmetic does not establish the G_n unit.

### Challenge and proof semantics

The [protocol parameters](https://docs.flop.network/docs/protocol-parameters) state an approximate seven-day challenge window bounded by data availability. That is not an exact runtime constant. The capacity-bond revocation window is not substituted for a session's challenge window. A recorded `challengeEnd`, when present, is compared to the recorded head as an observation. The verifier never turns this into a claim of chain finality or current challenge eligibility.

The [verification design](https://docs.flop.network/docs/verification-stack) describes co-signed transcript leaves and retained activation evidence. The retrieved public docs do not specify byte-exact Merkle encoding. Public source access to `flop-labs/flop-core` returned HTTP 404 during implementation. Merkle verification is intentionally unavailable until its encoding can be cited and tested.

The MCP tool description explicitly says that receipt fields other than authenticated TEE digest and verified compute are placeholders. The tool that simulates TEE verification is never called. A receipt is fetched only when public channel or settlement data contains an explicit HTLC hash-lock link. A channel id is never used as a guessed hash lock.

## Evidence format and boundaries

Version `1` bundles contain `network`, `channelId`, `capturedAt`, `observations` and `sha256`. Each observation contains its source URL, tool, arguments, receive time, attempt count, request duration and exact MCP tool text in `raw`. Transport failures record `error` instead. SSE and JSON-RPC transport are handled by `@flop-lab/mcp`. The bundle saves the tool text, not the transport envelope. Parsed values are derived again for each offline run.

Each hash covers UTF-8 canonical JSON of all fields except its own `sha256`. Object keys are sorted lexicographically. Arrays preserve order. Numbers use JSON serialization. Raw strings preserve their exact bytes after UTF-8 encoding. Only finite JSON values are allowed. The outer hash also covers the observation hashes and metadata. This is a format-local content hash, not a signature or a claim to implement a general JSON canonicalization standard.

All requests go through the shared read-only MCP client. Defaults are a 30-second per-instance cache, at most 64 cache entries, a 300 ms minimum request gap and two extra attempts on retryable errors. Cache hits keep the original measurement time. Channel search stops at a matching page and is bounded to 400 rows. Tape mode accepts a limit from 1 to 1000 and uses pages of at most 25. A capture is not an atomic chain snapshot. Pagination detects duplicates but cannot prove the absence of omitted rows during concurrent indexing.

Bundles are limited to 1 MB, 128 observations and JSON nesting depth 30. Amounts accept at most 120 decimal digits. These are input limits, not chain constants. Sources are recorded claims until authenticated independently. No URLs, expressions or scripts from an imported bundle are executed.

## Recorded evidence and checks

`fixtures/recording.json` records the live capture at `2026-11-05T08:59:59.311Z` from `https://mcp.flop.network/mcp`. The complete tape had 336 rows. All were cooperative. No forced settlement was available. Both arithmetic checks passed on all recorded rows. Five full channel bundles include unused escrow. Their assurance, price, challenge and Merkle checks remain unverifiable. The recording run made 39 HTTP requests with no retries. These are dated measurements, not claims about current devnet state.

```sh
pnpm --filter @flop-lab/verifier check
# Explicit network capture. Overwrites only the recorder's fixture files.
pnpm --filter @flop-lab/verifier record
```

Tests replay recorded tool answers through the shared client's `replayFetch`. They also rehash synthetic corruptions so arithmetic and provenance checks must detect contradictions independently of file integrity. CLI replay is tested without live requests. Default tests need no network.

## Browser workbench

The site's `/verify` page starts with a dated recorded channel. Paste a channel id or pick a recent settlement to collect current public observations. Expand any check for its inputs and exact source text. Download the bundle as `evidence.json`.

Choose **Verify a local bundle** to replay the downloaded file without a network request. The browser uses these same checks and Web Crypto. Local files are never uploaded. Hash failures stop further checks. The [page README](../../apps/web/app/verify/README.md) describes collection limits and local run commands.

## What a passing run still does not prove

A passing run proves only its named consistency claims against captured inputs. It does not prove inference was honest, correct or useful. An author can edit every input and rehash the bundle. Public views share an indexer and are not independent witnesses. Matching a registry hash does not prove model weights ran. Arithmetic does not prove payment execution. A successful indexed extrinsic does not prove consensus finality.

## What this does not verify

This tool does not verify chain consensus, source signatures, historical trust-root authenticity, agreed compute pricing, cryptographic transcript inclusion, co-signatures, activation commitments, hardware appraisal, exact challenge eligibility or data availability. It does not submit disputes or move funds. Devnet resets and public API changes can make captured records unavailable. Missing evidence stays visible as UNVERIFIABLE.
