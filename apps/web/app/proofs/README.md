# Proof explorer page

What do public proof rows establish about a paid settlement? This page places dated indexer observations beside the pinned verification architecture and exposes a coverage reason for each recorded settlement.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3710
```

Open `http://localhost:3710/proofs`. The page uses bundled public recordings and makes no browser calls to FLOP. `/proofs/recording` downloads the raw replay file. The CLI can refresh the recording independently.

## Interaction and motion

The architecture rail follows reading progress. Shared route markers connect the suite grid to the header. Evidence disclosures, observation tabs, settlement filtering and event-time ordering use layout or presence transitions. Final measured values remain readable. The coverage bar uses the recorded unknown-to-settlement ratio. Reduced motion uses immediate state changes with the full reading rail visible.

Recorder cards preserve each source's own timestamp. Close-spaced rolling windows do not establish a daily trend. Audit parameters are specification defaults, not measured runtime values.

## What this does not verify

This page does not verify proof payloads, signatures, hardware attestation, TOPLOC openings, validator quorum, inference execution or chain finality. It does not infer missing session evidence from an empty direct-rail table. UNVERIFIABLE is an evidence limit, not a failed proof.
