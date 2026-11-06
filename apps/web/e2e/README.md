# Browser contracts

Does every published route work with a keyboard and recorded evidence? These Chromium checks run against `next start`. They read the sitemap and require a primary interaction for each route.

## Run

From the repository root after `pnpm install`:

```sh
pnpm --filter web exec playwright install chromium
pnpm --filter web e2e:build
slot browser 1 -- pnpm --filter web e2e
```

Use `pnpm --filter web e2e` without the slot helper on an isolated CI runner. The server binds to `127.0.0.1:3540`. Playwright starts and stops it. An occupied port fails the run rather than testing another server.

## Coverage

- Every sitemap page at mobile and desktop widths.
- HTTP status, console errors and uncaught JavaScript errors.
- A named primary interaction that must change the rendered result.
- Actual Tab navigation through visible enabled controls. Native radio groups use their browser Tab stop.
- Axe serious and critical violations. Violations remain failures.
- Reduced-motion values without an active animation at hydration. Later data loads can still update a value.
- A first-viewport visual baseline for each route. Pixel ratio tolerance is configured explicitly in `playwright.config.ts`.
- A detector self-check inserts a button that Tab cannot reach and requires its detection.

New routes enter the run through `content/tools.ts`. The sitemap inventory test fails until their primary interaction is added to `interactions.ts` and their snapshots are reviewed.

## Recorded data and network isolation

`offline.mjs` blocks external fetches and sockets in the production server and build workers. Pages use their existing dated recordings when live reads fail. The test clock is fixed for stable server rendering and hydration. It is not an observation date.

The browser blocks unhandled external traffic and reports it as a failure. The public pull request fixture in `tests/fixtures/pull-request.json` supplies the provenance list. It retains its raw response, source and measurement time. Local recorded handlers supply the explorer, session and knowledge request mocks. Their raw source files remain in their owning packages. A local checkout has no deployed build signature. That boundary uses an explicit unavailable response.

Build with `e2e:build` before running these checks. It removes generated `.next` output before building under the guard. A normal live build can contain cached live data and is not a reproducible baseline.

## Review failures

See [the measured product findings](FINDINGS.md). These assertions remain active until the owning pages are fixed.

The HTML report is in `apps/web/e2e/report`. JSON results, axe evidence, viewport screenshots and failure traces are in `apps/web/e2e/artifacts`. Open a trace with `pnpm --filter web exec playwright show-trace <trace.zip>`. Traces retain actions, requests, source and screenshots. Per-action DOM snapshots are disabled because the full paper would be duplicated for every Tab press. Failure reports still contain an accessible page snapshot.

Update baselines only after inspecting the difference:

```sh
slot browser 1 -- pnpm --filter web e2e --update-snapshots
```

Baseline updates do not waive accessibility, keyboard or interaction failures. The footer commit is masked because it changes with each build. Baselines use the pinned Playwright Chromium on Linux. Review new baselines when changing that browser version.

## What this does not verify

These checks do not prove live service availability, chain correctness or deployment signatures. They do not replace screen-reader testing, full WCAG review or testing every interaction state. They check initial enabled controls and one primary action per route. Visual snapshots cover the first viewport. They do not measure performance or prove that every animation follows the site's motion specification. Synthetic calculator choices exercise their UI; they do not turn those scenarios into devnet observations.
