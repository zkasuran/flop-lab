# Release previews

Can a contributor preview package versions and inspect exactly what a release would contain? This repository-only tool reads JSON change notes, generates independent version and changelog candidates and packs unsigned private tarballs. It never publishes to npm or applies versions to the checkout.

From the repository root with Node 22:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/release check
pnpm --filter @flop-lab/release plan
```

## Version notes

Add `.changes/<short-name>.json` using the [change note format](../../.changes/README.md). `patch`, `minor` and `major` have their usual stable-semver meaning, including before 1.0. The largest requested bump wins. Changed runtime workspace dependencies trigger a patch bump in their dependents. This repeats through the dependency graph. Dev-only dependencies do not trigger release bumps.

```sh
pnpm --filter @flop-lab/release plan --out /tmp/flop-version-preview
```

The output directory must be new, outside the checkout and have an existing parent. `release-plan.json` records the source directory, commit, capture time and SHA-256 of every consumed note. Each package gets a candidate `package.json` and `CHANGELOG.md` under `packages/`. Preview manifests preserve workspace links. Packing resolves those links only in the staged tarball manifests. No pending notes means no version changes. Pre-release versions and workspace aliases are rejected rather than guessed.

This is the repository's changeset-equivalent workflow. It has no registry lookup and makes no network requests. The maintainer reviews and applies candidates in a separate version PR after release approval. See `.changes/README.md` for note archival. The current release command remains dry-run only.

## Pack a clean built checkout

```sh
pnpm check
pnpm build
pnpm --filter @flop-lab/release pack --out /tmp/flop-release-artifacts
```

Packing refuses a dirty checkout or an existing output directory. It stages tracked package files and built `dist/` files, adds the licence and generated changelog, converts workspace references to candidate versions and uses `pnpm pack`. It checks every declared export and binary path in each archive. Pack lifecycle scripts are disabled because the gate already built the checkout. Private-package guards remain enabled. The staging directories remain available for review.

`SHA256SUMS` covers the tarballs, `release-plan.json` and `RELEASE.md`. Verify from the artifact directory with `sha256sum -c SHA256SUMS`. `packages/release` is development infrastructure with source scripts. It has no suite binary or site route.

## Draft workflow

The **Draft package release** workflow runs on trusted main through manual dispatch. Its default is artifact-only. Set `create_draft` and a new `draft-...` tag to attach the checked tarballs, checksums and plan to a GitHub prerelease draft. It never replaces an existing release. A failed draft upload leaves the build artifact available for inspection. The orchestrator signs the release afterwards.

## What this does not verify

Tarball structure and hashes do not prove package behavior or signer identity. Source exports require a TypeScript-aware toolchain. Candidate dependency versions are not asserted to exist on npm. The tarballs are review artifacts, not a claim of standalone installation. The gate checks the checkout; it does not test every package after installation from its tarball. Hosted draft creation and DID signing require the reviewed workflow and orchestrator.
