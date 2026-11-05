# Kestra pipeline explorer

Inspect the YAML and dated outputs of the FLOP Kestra plugin. The default copy
action is the read-only flow from `plugins/kestra-flop/examples/observe.yml`.
It needs the installed plugin and no FLOP key.

## Run

From the repository root, with Node 22 and pnpm:

```sh
pnpm install
pnpm --filter web check
pnpm --filter web build
pnpm --filter web exec next start --port 3370
```

Open `http://localhost:3370/kestra`. Stop the server when finished.
The plugin build and install steps are in `plugins/kestra-flop/README.md`.

## Evidence

`observed.json` is a field-preserving excerpt of real Kestra 2.0.6 execution
outputs captured on 2026-11-05. Execution `3F4DXszdAcK2iyIVBRarwv` used the live
keyless MCP and model endpoints. The original execution JSON and logs were saved
with plugin PR #4. The `excerpts` object lists the omissions. The first settlement
row is complete. Original counts, dates and sources are retained.

The trigger record comes from controlled local cursor replay with the live tape.
It is not evidence that a new settlement arrived during the test. Chat used a
local mock. The YAML for that node points to the local mock explicitly.

The page makes no FLOP requests. Its data changes only when a reviewed recording
is committed. `/kestra/evidence` exposes the same excerpt as JSON with a one-hour
HTTP cache TTL. Model freshness flags describe the worker clock at capture.
They are not current quote validity. The ION URI belongs to the removed local
Kestra instance.

The coverage bar is `tape.count / tape.total`. It is a fraction of the reported
tape read, not a verification score. Final values remain readable while the bar
animates. The vertical line tracks scroll position. Nodes share a moving
selection background and switch the inspector immediately. The shared shell
provides route transitions. Motion uses transform and opacity with reduced-motion
equivalents. Arrow keys, Home and End select a task. Tab moves into its inspector.

## What this does not verify

This page does not execute Kestra or reproduce the historical devnet state.
It does not verify inference, proofs, signatures, chain inclusion, finality or
indexer truth. Arithmetic PASS applies to the supplied rows only. The partial
tape does not represent a full-chain audit. Live gateway chat, gateway cost
enforcement and atomic trigger delivery remain unverified. The recorded outputs
are not signed receipts. Devnet can reset.
