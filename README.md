# flop-lab

What can you check about the FLOP devnet from outside? flop-lab is a suite of open tools for watching the network, checking its claims and building on its public interfaces.

**[Live suite](https://flop.zkasuran.dev) · [Documentation](https://flop.zkasuran.dev/docs) · [Upstream findings](https://flop.zkasuran.dev/docs/findings)**

FLOP is a blockchain where AI agents pay GPU miners for inference. Its [protocol](https://docs.flop.network) promises proofs of the work, a window to challenge sessions and stake slashing for proven fraud. The suite puts those promises beside the evidence a public reader can obtain.

This is a community project by zkasuran. It is not an official FLOP product. The tools use public interfaces and dated recordings. The devnet is disposable and can reset.

## Quick start

From a checkout with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/cli... --workspace-concurrency=1 run build
node packages/cli/dist/cli.js --help
```

The last command runs `flop`, the suite dispatcher. Use `node packages/cli/dist/cli.js list --json` for its registry. Use `node packages/cli/dist/cli.js verify --help` for a tool's options. These discovery commands need no wallet, key or account.

The [docs hub](https://flop.zkasuran.dev/docs) searches package titles, questions and README headings. Its package pages are generated from the READMEs at build time. Each links the source, tool page and registered command. Read a package's quick start before running it.

`node packages/cli/dist/cli.js which miner reliability` finds matching tools. `node packages/cli/dist/cli.js help score` shows the selected tool's options. `completions bash`, `completions zsh` and `completions fish` print shell completion scripts. Put `--json` last when running a tool. The wrapper preserves child exit codes. See the [CLI guide](packages/cli/README.md) for shell setup, the output contract and measured git-URL packaging limits.

## The suite

Choose the section that matches your question. Each tool has a README with its inputs and limits. Planned entries are labelled below.

### Observe

What is the network doing now and over time?

- [Network history](packages/recorder): record dated snapshots and compare changes.
- [Chain explorer](packages/explorer): inspect blocks, accounts, channels and their query evidence.
- [Model registry](packages/models): join model listings with registry hashes and dated price sources.
- [Session lifecycle](packages/sessions): classify compute channels from their published lifecycle fields.
- [Finality monitor](packages/finality): measure linked block times and reported finality lag.
- [Upgrade tracker](packages/upgrades): compare pinned spec revisions and package releases.
- [Service status](packages/status): record whether public services answered bounded probes.
- [Community pulse](packages/community): inspect public requests and observed response times.

### Verify

Do the claims hold when checked from outside?

- [Settlement verifier](packages/verifier): cross-check settlement arithmetic, receipts and attestation evidence.
- [Conformance harness](packages/harness): test documented claims against bounded public responses.
- [Spec differ](packages/spec): compare pinned yellowpaper clauses with dated devnet observations.
- [MCP contract audit](packages/mcpaudit): check tool responses against advertised schemas.
- [Indexer audit](packages/indexer-audit): compare totals, block links and settlement accounting.
- [Emission and fees](packages/economics): model quoted emission and compare dated settlement fees.
- [Metering and calibration](packages/metering): calculate reference-work units and inspect lease evidence.
- [Proof explorer](packages/proofs): inspect proof submissions and explain settlement coverage gaps.
- [Security invariants](packages/invariants): map quoted failure cases to scoped checks.

### Build

How do I integrate with FLOP correctly?

- [SDK conformance](packages/sdkconf): check published SDK behavior with offline request traces.
- [MCP console](packages/console): call read-only public tools and inspect their responses.
- [Agent starter](packages/create-flop-agent): generate a devnet agent with fixture-backed dry runs.
- [Pay-per-call kit](packages/x402kit): diagnose payment headers and replay recorded handshakes.
- [Spec reader](packages/yellowpaper): read pinned sections beside dated parameter evidence.
- [Knowledge catalog](packages/knowledge): browse catalog relationships and cited requirements.
- [Data export](packages/export): write dated datasets with hashes and resumable parts.
- [FLOP for Kestra](plugins/kestra-flop): read the devnet and check settlements in a workflow.
- Python client: planned. Track its entry in the [tool registry](apps/web/content/tools.ts).
- [Suite API](packages/openapi): serve validated dated results with a generated OpenAPI contract.

The [shared MCP client](packages/mcp) handles the hosted server's event stream, spacing and retries. The [suite CLI](packages/cli) dispatches to package binaries.

### Operate

Is my miner or validator ready to join?

- [Operator doctor](packages/doctor): compare local readiness with sourced requirements.
- [Stake and slashing](packages/staking): model quoted bond requirements and indexed stake evidence.
- [Watcher](packages/watch): evaluate dated network changes with persisted rules and bounded delivery.

### Agents

How does an agent spend, route and review disputes?

- [Miner scoreboard](packages/scoreboard): rank miners from observed reliability and settlement history.
- [Spend guard](packages/spendguard): apply shared budgets and price ceilings with a locked audit ledger.
- [Challenge watcher](packages/challenger): track challenge windows and draft evidence dossiers.
- [Deal inspector](packages/tclk-inspect): inspect signed agent transcripts against the pinned protocol.
- [flop-lab MCP server](packages/mcp-server): expose schema-checked read-only suite operations to agents.
- [Swap planner](packages/swaps): check quoted timing constraints against dated HTLC evidence.

### Identity

Who did this work and can I check it?

- [DID trail](packages/did): follow signed artifacts and verify their exact bytes.

The [contribution verifier](https://flop.zkasuran.dev/provenance) checks publisher signatures in your browser.

## Dated findings

- **2026-11-05T08:59:55.135Z:** the verifier's recorded MCP tape contains the sample used for 20 settlement rows on the home page. Replaying its escrow and price-ratio checks gives 40 passes and 0 failures. [Raw recording](packages/verifier/fixtures/settlements-0.json) · [Check implementation](packages/verifier/src/checks/index.ts).
- **2026-11-05T22:52:19.352Z:** the harness recording contains 177 passing claims, 3 failures, 54 unverifiable claims and 5 skipped claims. [Recorded run](packages/harness/last-run.json).
- **2026-11-06T07:44:15.086Z:** the GitHub query for network issues authored by zkasuran returned 5 reports, all open. **2026-11-06T07:44:15.721Z:** the yellowpaper query returned 9 reports, all closed. [Saved responses and query sources](apps/web/app/docs/findings) · [Dated issue list](https://flop.zkasuran.dev/docs/findings).

These observations describe the saved samples. Re-run the tools for a new observation. A closed upstream issue is a recorded state, not a verified deployment fix.

## How the work is made and signed

Agents work from written scopes in separate git worktrees. They keep decisions, checkpoints and command evidence on disk. The [contributor rules](AGENTS.md) set the shared constraints.

A separate publisher checks the final commit's install, lint, types, tests and build results. It checks the wording and signs a manifest of changed file hashes. Build agents do not hold the signing key or publish directly.

Eligible pull requests merge automatically when CI is green, the branch merges cleanly and the merge result passes install, check, build and the Markdown voice check. Changes under `.github/` wait for human review. The signed deployment carries a repository manifest at [`/SIGNATURE.json`](https://flop.zkasuran.dev/SIGNATURE.json).

The publisher's Ed25519 identifier is:

```text
did:key:z6MkoA8xuzKJRGtHa5hr6znFCZq164mb45JHx6kktdJ6tMdL
```

The [about page](https://flop.zkasuran.dev/about) follows a recorded signed pull request. Its dates and counts come from the saved artifact. A signature binds manifest bytes to a public key. Tests and mutation checks address behavior.

## Development

`pnpm -r --if-present run check` runs package checks. `pnpm -r --if-present run build` builds the suite and site. The docs-specific checks run with `pnpm exec vitest run --config apps/web/app/docs/vitest.config.ts`.

The site lives in `apps/web`. TypeScript tools live in `packages`. The Kestra plugin lives in `plugins/kestra-flop`. The offline signature checker lives in `scripts`.

## Licence

Apache-2.0. See [LICENSE](LICENSE).

## What this does not verify

Public indexer responses and recorded fixtures are evidence about those responses. They do not establish inference correctness, hardware integrity or chain finality. Unavailable checks stay explicit. A signature does not establish code safety or a person's identity. Read each package's final limits section for the exact boundary of its result.
