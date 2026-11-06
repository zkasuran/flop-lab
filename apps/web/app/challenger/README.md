# Challenger page

Which forced claims close next? `/challenger` shows indexed end blocks against a reported finalized head, a separate ranked payout tape and verifier-backed dossiers. The shared shell supplies route transitions, theme and controls.

## Run

From the repository root:

```sh
pnpm install
pnpm --filter web build
pnpm --filter web exec next start --port 3570
```

Open `http://localhost:3570/challenger`. Filter open, closing or closed claims and select **Inspect claim**. The native dialog supports keyboard focus containment, Escape and focus return. Download Markdown, JSON or the verifier bundle. **Verify offline** replays the attached evidence locally.

For the CLI:

```sh
pnpm --filter @flop-lab/challenger build
node packages/challenger/dist/cli.js windows --recorded
```

## Data and limits

The server uses the shared MCP client. A tape collection reads at most 1000 rows, stats and block samples. A separate window collection reads at most 100 forced claims, reported finality and block samples. Each collection has an 8000 ms deadline. Requests are spaced by 300 ms and allow one retry with backoff on 429 or 5xx. Each server instance coalesces concurrent reads and caches success or failure for 60000 ms after completion. There is no polling loop.

The committed fallback is derived from the first 100 rows of the retained raw tape. Its reported total is 336 and coverage is explicitly partial. It retains the snapshot time `2026-11-05T09:00:03.613Z` and each underlying response keeps its own capture time. Regenerate it without network calls using `pnpm exec tsx packages/challenger/test/export-site.ts`. The source SSE responses and manifest remain in `packages/challenger/fixtures/`. The derived file is validated using the same settlement parser as the live collection.

After a live failure, the page keeps the last successful observation and labels it last-known. A successful empty response stays empty. The refresh control respects the server cache. No independent finality claim is made. A page can stay open beyond its cache TTL, so capture and evaluation times remain visible.

Dossiers accept only an exact channel in either snapshot. Requests for the same channel are coalesced. Another active dossier returns a busy message. The per-instance cache holds at most 16 dossiers for 60000 ms. Live collection uses verifier v2 with at most 100 settlement rows and a 20000 ms operation deadline. Recorded bundles cover one payout and one forced claim. Other recorded channels state that evidence is unavailable. No URL or tool name is accepted from the browser.

Window fallback retains `2026-11-06T03:52:08.729Z`: 10 forced claims against head 3013999, with 3 open and 7 closed. Payout and window captures carry separate last-known labels and dates. A successful empty window response stays empty. Missing finality never falls back to best head. Safe mode suppresses estimated wall-clock time.

Motion follows the evidence: staged reading order, a scroll-linked closing timeline, real-value block bars, filter and row layout transitions, a payout-time distribution and immediate control feedback. Reduced motion removes travel and duration while retaining labels and final values. Scroll lines measure reading position, not verification.

## Checks

```sh
pnpm --filter @flop-lab/challenger check
pnpm --filter web check
```

The package's site tests cover fixture fidelity, lane filtering, empty tape, last-known recovery, original timestamps, concurrent request sharing, failure caching, hostile IDs and stalled response bodies. Browser evidence and mutation logs are retained with the site PR.

## What this does not verify

The page does not establish fraud, runtime filing deadlines, caller eligibility, current bonds, stake, inference correctness or finality. Cooperative payouts have no standard window in the inspected SDK. Other audit lanes are not established by this tape. No DA blob, independent prefill, TOPLOC comparison or bisection is performed. No dispute is submitted. Scores describe attention priority over the retrieved cohort and are not fraud probabilities.
