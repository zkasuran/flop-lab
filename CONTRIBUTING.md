# Contributing to flop-lab

Can someone else reproduce your change? Start with a clean checkout, keep the scope small and include the commands and evidence that show what changed.

## Setup

Use Node 22 and the pnpm version in the root `packageManager` field. Enable Corepack if pnpm is not available. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

The first build creates package binaries. A package-only loop is `pnpm --filter @flop-lab/<package> check`. Run the full gate above before opening a PR. Keep offline tests deterministic. Opt-in live checks must skip cleanly when unavailable. The Java plugin has its own instructions under `plugins/`; this guide covers the pnpm workspace.

## Make a change

- Read `AGENTS.md` and the package README first.
- Use TypeScript strict mode, ESM and the shared lint and format configuration.
- Put `SPDX-License-Identifier: Apache-2.0` on new source files.
- Use `@flop-lab/mcp` for hosted MCP requests. Validate external data before using it.
- Use public read-only devnet endpoints. Do not add wallet operations to an unrelated change.
- Keep recorded responses below 200 KB with source and capture time. Reuse `@flop-lab/fixtures` for shared observations when available. Retain distinct observation times even when bodies match.
- Cover empty and hostile inputs. For logic that decides a result, break the decision deliberately, save the failing test output, restore it and save the passing output.
- Run README commands in a fresh clone. For site changes, check desktop, mobile and reduced motion. Keep the final value readable without waiting for animation.

Use conventional commit subjects: `type(scope): summary`. Types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `release` and `test`. Merge current main before the final check. Do not rebase shared branches or force-push.

## Voice and evidence

Write short direct sentences. Use ordinary words. Do not use em or en dash characters. Do not put a comma before `and` or `or` in prose. Avoid praise, filler and unmeasured claims.

Every number shown as an observation needs its source and time. Label synthetic examples. An empty response is not zero activity unless the source establishes that meaning. Each package README starts with the question it answers, includes runnable setup and ends with **What this does not verify**.

## Versions and release candidates

Add a JSON note under `.changes/` for a user-facing package change. Explain the effect and name the affected package with `patch`, `minor` or `major`. The [note guide](.changes/README.md) defines version and dependency rules.

```sh
pnpm --filter @flop-lab/release plan
pnpm --filter @flop-lab/release plan --out /tmp/flop-version-preview
```

Review the candidate versions and per-package changelogs. These commands do not modify versions or publish packages. The [release guide](packages/release/README.md) documents tarballs, hashes and the manual draft workflow. Use a new output directory for each run. Generate lockfile changes with `pnpm install --no-frozen-lockfile`; do not edit the lockfile by hand.

## Pull requests and signing

Describe **What**, **Why** and **Checks** in the PR template. Include test commands, measured evidence and limits. Changes to workflows require maintainer review. CI must pass on the merge result.

Ordinary contributors submit their code and evidence through GitHub. Build agents in the coordinated lab use the assigned publisher. That publisher adds DID-signed manifest evidence to their PRs. Contributors do not need the owner's signing material and must not put it in a checkout or workflow.

The release workflow creates an unsigned GitHub draft. The orchestrator signs the reviewed release afterwards. SHA-256 sums detect changed artifact bytes. They do not identify a signer. A DID signature identifies the signer of its exact manifest bytes; it does not prove inference correctness or the truth of observations. The site's `/provenance` and `/did` pages explain those boundaries. Checkout verification is available through `pnpm exec tsx scripts/verify-signature.mjs SIGNATURE.json .` when a signed build manifest is present.

## Report a problem

Use the bug template for a minimal reproduction with the package version or commit, environment, source time, observed result and expected result. Search existing issues first. Use the feature template to explain a user's question and the observable change that would answer it.
