# Challenger page

`/challenger` reads the public settlement tape, explains challenge lanes and opens a dry-run dossier. It uses the package's exact window and priority logic. The shared shell supplies the route transition, theme and controls.

## Run

From the repository root:

```sh
pnpm install
pnpm --filter web build
pnpm --filter web exec next start --port 3360
```

Open `http://localhost:3360/challenger`. Choose a lane or sort order and select **Inspect**. The native dialog supports keyboard focus containment, Escape and focus return. Its URL can be shared with the exact channel ID. Downloaded JSON carries each evidence source and capture time.

For the CLI:

```sh
pnpm --filter @flop-lab/challenger build
node packages/challenger/dist/cli.js watch --recorded --limit 8
```

## Data and limits

The server uses the shared MCP client. A collection reads at most 1000 rows, stats and block samples. The whole operation has an 8000 ms deadline. Requests are spaced by 300 ms and allow one retry with backoff on 429 or 5xx. Each server instance coalesces concurrent reads and caches success or failure for 60000 ms after completion. There is no polling loop.

The committed fallback is derived from the first 100 rows of the retained raw tape. Its reported total is 336 and coverage is explicitly partial. It retains the snapshot time `2026-11-05T09:00:03.613Z` and each underlying response keeps its own capture time. Regenerate it without network calls using `pnpm exec tsx packages/challenger/test/export-site.ts`. The source SSE responses and manifest remain in `packages/challenger/fixtures/`. The derived file is validated using the same settlement parser as the live collection.

After a live failure, the page keeps the last successful observation and labels it last-known. A successful empty response stays empty. The refresh control respects the server cache. No independent finality claim is made. A page can stay open beyond its cache TTL, so capture and evaluation times remain visible.

Dossiers accept only an exact channel in the snapshot. Requests for the same channel are coalesced. Another active dossier returns a busy message. The per-instance cache holds at most 16 dossiers for 60000 ms. Live dossiers read channel and trust-root observations. Recorded dossiers replay retained evidence. Only the recorded example channel has a channel response; other recorded channels state that it is unavailable. No URL or tool name is accepted from the browser.

Motion follows the evidence: staged reading order, a payout-time distribution from observed timestamps, real-value bars, lane filter and row layout transitions, a scroll-linked feasibility reading line and immediate control feedback. Reduced motion removes travel and duration while retaining labels and final values. The scroll line measures reading position, not verification.

## Checks

```sh
pnpm --filter @flop-lab/challenger check
pnpm --filter web check
```

The package's site tests cover fixture fidelity, lane filtering, empty tape, last-known recovery, original timestamps, concurrent request sharing, failure caching, hostile IDs and stalled response bodies. Browser evidence and mutation logs are retained with the site PR.

## What this does not verify

The page does not establish fraud, runtime filing deadlines, caller eligibility, current bonds, stake, inference correctness or finality. Cooperative payouts have no standard window in the inspected SDK. Other audit lanes are not established by this tape. No DA blob, independent prefill, TOPLOC comparison or bisection is performed. No dispute is submitted. Scores describe attention priority over the retrieved cohort and are not fraud probabilities.
