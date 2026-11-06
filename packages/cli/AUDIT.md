# Suite CLI audit

Measured on 2026-11-06 against origin/main `b421a4a0db776b7f7f0409d3c0afe25a4c611c96` plus this CLI change. Node v22.22.2. pnpm 11.25.0. Linux. The audit records the built wrapper's SHA-256 separately from the base revision.

## Method

The reverse inventory found 30 tool binaries and 30 registered subcommands. Every tool returned nonempty help with exit 0 through the corrected wrapper. All sections matched the site's registry. The CLI itself is the dispatcher and the MCP client has no binary.

The audit ran each built command with `--help`, bare `--json`, an unknown option and an explicit output probe. Network access was blocked. Commands ran in a temporary directory. No wallet or live FLOP request was used. Explicit probes use bundled recordings, offline local checks or deliberate empty inputs as identified below. These are CLI behavior measurements, not a fresh devnet audit.

Run `pnpm exec tsx packages/cli/scripts/audit.ts /tmp/flop-cli-audit` after building to reproduce the records. Each record has its invocation, timestamp, source revision, wrapper hash, duration, exit, output hashes and raw output file names. Join raw chunks in listed order. An earlier capture limit truncated large reports; the completed run increased the process buffer and split the retained output into bounded files. Truncated preliminary results are not used below.

## Measured behavior

`J` means stdout parsed as one complete JSON value. `text` includes empty stdout. The bare probe is `flop NAME --json`, without an operation. The invalid probe is `flop NAME --cli-audit-invalid`.

| Command    | Bare JSON exit / output | Invalid exit | Explicit probe                              | Exit / output |
| ---------- | ----------------------- | ------------ | ------------------------------------------- | ------------- |
| watch      | 1 / text                | 1            | check generated example rules, JSON adapter | 0 / J         |
| upgrades   | 0 / J                   | 1            | bundled recordings                          | 0 / J         |
| knowledge  | 0 / text                | 1            | catalog recording                           | 0 / J         |
| spec-read  | 0 / J                   | 1            | pinned index                                | 0 / J         |
| metering   | 0 / text                | 2            | observe recording                           | 0 / J         |
| invariants | 0 / J                   | 2            | catalogue                                   | 0 / J         |
| swap       | 2 / text                | 2            | observe recorded, JSON adapter              | 0 / J         |
| finality   | 2 / text                | 2            | snapshot recorded                           | 0 / J         |
| proofs     | 0 / J                   | 1            | coverage recording                          | 0 / J         |
| did        | 0 / text                | 1            | recorded signer trail                       | 0 / J         |
| economics  | 0 / text                | 1            | compare recording                           | 0 / J         |
| sessions   | 3 / J                   | 1            | list with network blocked                   | 3 / J         |
| models     | 0 / J                   | 2            | recorded devnet input                       | 0 / J         |
| call       | 0 / text                | 1            | list with network blocked                   | 1 / text      |
| start      | 1 / text                | 1            | bare flag, no JSON mode                     | 1 / text      |
| indexer    | 2 / text                | 2            | recorded devnet snapshot                    | 1 / J         |
| tclk       | 2 / J                   | 2            | empty object transcript, offline            | 1 / J         |
| contracts  | 2 / text                | 2            | stats audit with network blocked            | 2 / J         |
| history    | 1 / text                | 1            | empty local store, JSON adapter             | 0 / J         |
| explore    | 1 / text                | 1            | block:1 with network blocked                | 3 / J         |
| doctor     | 64 / text               | 64           | miner offline, skip ports                   | 2 / J         |
| spec       | 2 / text                | 2            | diff recorded                               | 0 / J         |
| verify     | 1 / J                   | 1            | empty object evidence bundle                | 1 / J         |
| harness    | 2 / text                | 2            | list catalogue, JSON adapter                | 0 / J         |
| score      | 1 / text                | 1            | rank recorded snapshot                      | 0 / J         |
| guard      | 1 / text                | 1            | lint example policy, JSON adapter           | 0 / J         |
| challenge  | 1 / text                | 1            | windows recorded                            | 0 / J         |
| x402       | 1 / text                | 1            | inspect recorded headers, JSON adapter      | 0 / J         |
| sdk        | 2 / text                | 2            | scripted SDK scenarios, network blocked     | 1 / J         |
| stake      | 0 / text                | 1            | observed recording                          | 0 / J         |

## Fixes in this package

- Canonicalize the resolved binary path. The harness compared its module URL with the symlink argument and skipped its entry point. The new spawn test catches empty help, not just exit 0.
- Add `flop help NAME` with the same output as `flop NAME --help`.
- Accept trailing `--json` on listed JSON-native operations. Preserve child schemas and codes.
- Reject invalid suite options before launching a child. Search reports no match rather than printing the full registry.
- Generate completion scripts from the registry and validate all package bins in reverse.

## Process startup

Measured at 2026-11-06T07:10:52.658Z with a fresh Node process per sample. Filesystem caches were not cleared. Five `--help` runs had a median of 77.42 ms, minimum 65.68 ms and maximum 91.48 ms. Five `which miner reliability --json` runs had a median of 55.54 ms, minimum 50.62 ms and maximum 73.77 ms. The network guard was active. These timings describe this shared host, not a service latency claim.

Reproduce with `pnpm exec tsx packages/cli/scripts/benchmark.ts`. Suite discovery does not use a network cache. Child request budgets, retries and cache TTLs remain those documented by each tool.

## Differences for package owners

Usage errors still return 1 in watch, upgrades, knowledge, spec-read, proofs, did, economics, sessions, call, start, history, explore, verify, score, guard, challenge, x402 and stake. Doctor uses 64. The wrapper preserves these codes.

Doctor's UNKNOWN is 2. Guard's deny and lint findings use 2. Finality and contracts also use 2 for incomplete evidence. These meanings overlap the suite usage convention. They require owner changes to standardize without losing meaning.

Bare `--json` can print help, fail usage or perform a default operation. Call and explore have no offline replay flag in their help. Call's blocked-network failure produced no JSON stdout. Start has no JSON mode. Watch has streaming and JSON Lines operations that do not fit a single-value JSON contract.

The SDK scenario finding was obtained under the audit network guard. This audit does not attribute that result to an upstream SDK defect. The indexer finding is from its existing recorded snapshot. Neither is a new live service claim.

## What this does not verify

Help and output-format checks do not verify the tools' conclusions. This matrix does not exercise every operation or every exit path. It does not measure live availability. Zsh and fish were absent, so their syntax checks were skipped. Bash parsing and actual prefix completion passed. No new site page or browser behavior was changed.
