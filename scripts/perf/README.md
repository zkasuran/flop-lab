# Mobile performance budgets

Is every sitemap page fast on a phone? This runner measures a local production build with Lighthouse mobile. It fails when a route's median performance score is below 90 or its median cumulative layout shift exceeds 0.05.

## Quick start

From the repository root with Node 22.19 or later, pnpm and Chrome installed:

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web perf
```

On the shared build machine, wrap the last command with `slot browser 1 --`. The wrapper is machine tooling, not a project dependency. Use `--chrome-path /usr/bin/google-chrome` to select Chrome. Use `--no-sandbox` only where the local browser environment requires it.

## Measurement

The runner starts its own production Next server on localhost port 3810 and Chrome on port 3811. Both ports must be free. Override them with `--port` and `--chrome-port`. It stops its own processes when done or interrupted. It never reuses another running server.

It reads `/sitemap.xml`, validates the page URLs and measures each unique path. Three cold-browser-cache runs use Lighthouse's default mobile simulated throttling. Routes run in round-robin order. Browser cache and storage reset between runs. The server stays warm. Its first successful sitemap response gives the recorded process startup time.

The performance and CLS medians are computed independently. A median is the middle sorted value of exactly three valid samples. Threshold checks use the unrounded values. Missing reports, failed page responses, redirects, missing metrics and build changes fail the run. There are no automatic retries of a failed audit. The runner finishes the other routes and records the errors.

`--route /about` selects a diagnostic subset. Repeat the flag for more routes. The report marks this as selected-route coverage. Only the default command checks the complete sitemap.

Reports go to a dated `.next/perf/` directory. `--output /absolute/path` chooses a directory. Existing evidence is not overwritten. Each output contains:

- `report.json`: dates, local source, build ID, checkout commit, dirty state, host, browser, Lighthouse settings, per-run metrics, medians and pass/fail.
- `report.md`: a per-route table.
- `sitemap.xml`: the exact route source.
- `<route-index>-<run>.json.gz`: the full raw Lighthouse report, including diagnostics and request records.
- `server.log`: production server output.

Next 16 no longer prints route byte sizes in its build table. The runner reads each production HTML response's initial script references and sums the unique files in `.next/static/`. Shared chunks count once per route. These are uncompressed file bytes, not estimated transfer bytes. The Lighthouse request log separately supplies browser request counts and JavaScript transfer bytes, including prefetches. Inline hydration data and later interaction-only chunks are outside the build JS total.

`index.ts` exposes runtime validation, median budgeting, sitemap route selection and emitted-byte measurement. The web package's `check` command type-checks, lints and tests these helpers. The recorded fixture is an unchanged subset of a local Lighthouse report. Its metadata identifies the original compressed report by hash. Boundary tests cover missing observations and strict thresholds.

## What this does not verify

This is a local lab navigation audit. It does not establish deployed performance, real phone field data, interaction responsiveness, network uptime or correctness of the page's evidence. Pages outside the sitemap are outside this command's coverage. API refreshes can change content between runs. Other work on the host can affect timings. Compare the same Chrome version and host with the same load. A passing median does not say that every run passed.
