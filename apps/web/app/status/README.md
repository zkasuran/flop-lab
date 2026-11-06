# Service status page

Are FLOP's public endpoints returning the expected content? This page shows dated archive samples with source links, equal-weight probe availability, elapsed-time sparklines and observer-specific failure spans.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3730
```

Open `/status`. The server caches the public `data/status/recent.jsonl` read for five minutes. A failed read uses bundled real captures and labels them recorded fixtures. A valid empty archive remains empty. `/status/recording` exports the displayed observations.

Filters change the selected sample window. Sorting uses the latest observed elapsed time. Sparklines use capture times on the horizontal axis and a per-service elapsed-time scale. Gaps over 4.5 hours break the line. Exact values remain readable while the line draws. Disclosures show HTTP results and content checks. The reading guide tracks scroll progress. Shared header markers preserve route continuity. Reduced motion uses immediate states.

## What this does not verify

The page does not run service probes in the visitor's browser. It does not establish current health, uninterrupted uptime, outage duration, inference correctness or chain finality. Archive scheduling and deployed performance require hosted verification. A missing scheduled round is not counted as a pass or failure.
