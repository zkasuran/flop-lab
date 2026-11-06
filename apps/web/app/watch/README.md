# Watch page

How do I turn observed changes into local alerts? This page builds the watcher's validated YAML and replays saved public observations from a UTC day. It uses the same rule evaluator as the CLI.

## Run

From the repository root:

```sh
pnpm --filter web build
pnpm --filter web exec next start --port 3740
curl -fsS http://localhost:3740/watch
```

The builder supports each watch rule and output. It never starts a local process or sends a notification. The replay route accepts bounded YAML and evaluates only bundled samples. Webhook URLs are configuration text. Local report paths are not read by the page.

The recordings started at `2026-11-06T04:45:55.439Z` and `2026-11-06T04:49:00.280Z`. Their raw public source responses are in `packages/watch/test/fixtures`. The default rules replay without alerts. The page reports the sampled interval rather than asserting continuous daily coverage.

Shared reading reveals follow the page order. The rule fields and replay transitions use layout animation. Measured counts arrive as whole values and the source bar represents validated responses in the selected poll. The reading guide tracks scroll position. Controls use immediate feedback. Reduced motion keeps the same information without travel.

Tests for the replay projection and request boundary are in `packages/watch/test/site.test.ts`. The suite recording adapter is limited to the watch entry and is required for alpha tools.

## What this does not verify

This page does not verify current health, complete daily history, chain finality, a reset, inference correctness or runtime challenge eligibility. It does not inspect local reports or test a configured notification target. Missing observations remain missing. Public reads were sequential and settlement and channel coverage is partial.
