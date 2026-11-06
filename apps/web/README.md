# flop-lab web

What can I check about FLOP from outside? This site brings the independent devnet tools together. Start with dated network observations, open a tool to inspect its evidence or check a contribution signature in your browser.

## Quick start

From the repository root with Node 22 and pnpm. Open http://localhost:3380 after the server starts:

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3380
```

Stop this server before using the development commands below.

## Run

Use Node 22 and the workspace version of pnpm. From the repository root:

```sh
pnpm install
pnpm --filter web dev
pnpm --filter web check
pnpm --filter web build
pnpm --filter web start
```

Open http://localhost:3300. Stop the dev server before starting the production server. Press `/`, Ctrl-K or Cmd-K to search tools, sections and README headings. Use arrows to move through results and Escape to close.

## Add a tool page

Add `app/<slug>/page.tsx` and export Next.js metadata with a page title and description. Update one entry in `content/tools.ts`. Set `status` to `alpha` or `live` only when the page works. The registry drives cards, palette destinations and the sitemap. A live status is a release label, not a service uptime claim.

Use `app/tokens.css` for colours, type, spacing, radii and motion timing. Token names are stable so tool pages inherit theme changes. `--pass`, `--fail`, `--unverifiable` and `--skipped` give each result one colour across the site. Unverifiable results also carry a hatch and skipped results a dashed outline, so colour is never the only signal. Shared classes include `section`, `section-heading`, `page-heading`, `panel`, `frame`, `button`, `quiet-button`, `icon-button`, `text-link`, `muted`, `mono`, `badge`, `status-dot`, `kbd`, `success`, `warning` and `error`. `frame` adds the corner marks used on instrument cards. Do not restyle the shell. The layout includes the sticky header, the independent-project notice and the proof footer on every page.

Use `motion/react` for animation and `useReducedMotion` for a static alternative. `components/motion.tsx` supplies `ReadingReveal`, `ReadingPath`, `ReadingSteps`, `MotionButton`, `MotionLink`, `ObservedNumber`, `SwapValue`, `Disclosure` and the `useSeen` hook. `components/icons.tsx` supplies inline SVG icons and the mark, so arrows render the same on every system. The shared `RouteSurface` animates route arrivals and keeps content readable throughout. It also keeps one layout group mounted across routes, so the `ToolMark` route marker on an index row travels into that tool's header. Do not give a nested `LayoutGroup` an `id` around a `ToolMark`, because the ID namespaces the marker and stops the travel. `components/reveal.tsx` preserves the existing reveal API. Fonts are bundled locally through `next/font` without a build-time font request.

`ReadingPath` and `ReadingSteps` use scroll position to fill an explanatory line. It is reading progress, not a verification state. Reduced motion shows the full line. `ObservedNumber` and `SwapValue` move a recorded value as a whole; they never count through invented intermediate values. `useSeen` treats content that starts on screen as already seen, so a first paint never hides a final value. Disclosure contents mount immediately and use layout motion. Controls act on the same click that starts their feedback. All timed transitions finish within 600 ms, including staggers. There is no ambient loop. The static film grain and grid never move.

The header gains a frosted background after the first scroll and marks the home section under the reading line. The numbered section navigation below it marks the current section on section pages and tool pages. The palette groups results into sections, tools and docs. Groups follow the rank of their best match, so the highlighted first row is the result Enter opens from the input. Arrows move focus, Home returns to the input and Escape restores focus to the control that opened it. The theme control uses a 520 ms view transition from the pointer where the browser supports it and switches at once otherwise.

## Observations and request budget

The home page uses `@flop-lab/mcp` for `flop_get_stats` and `flop_list_settlements` with a page limit of five. The keyless gateway model list supplies distinct miner addresses from `x-flop.price_sources`. The displayed settlement is the greatest timestamp in that returned page. No full-history claim is made.

The server caches each source for 30 seconds and coalesces concurrent reads. Next.js revalidates the page every 30 seconds. Visible browser tabs request a refreshed page on the same interval. A healthy uncached read makes three public requests. MCP calls are spaced by the shared client. Each source gets one attempt per refresh, with an eight-second response deadline and a 200 KB response limit. Failures back off from 30 seconds to five minutes. `Retry-After` can extend that wait.

Last-good values are retained per server process. A cold process falls back to the committed real recordings in `tests/fixtures/`, with their original measurement times. This fallback is explicitly labelled last known. An empty successful response replaces the previous list. Empty lists and missing fields never become invented counts. Instances do not share their in-memory caches.

The observations section plots one node per recorded price-source address. A grid orders addresses by hash, not geography or a performance score. Filled centres occur in the returned settlement sample. The sample bar is the number of distinct price-source addresses found in that page divided by the total distinct price-source addresses. The exact numerator and denominator remain readable while the bar moves. Missing sources show an unavailable comparison. Empty price-source lists show zero addresses without dividing by zero.

The map can filter to matching addresses. Its disclosure lists full addresses and both source times. A missing match is only absence from this page. New settlement observations pulse once. Motion stops when the map is off-screen or the tab is hidden. Reduced motion uses instant changes with the same numbers and labels. Observations in the comparison can have different measurement times; they are not an atomic network snapshot.

Refresh the raw recordings with `pnpm --filter web exec tsx scripts/record-devnet.ts`. Review the recorded time and update the golden test expectations deliberately. Run the optional keyless live check with `FLOP_LIVE_TEST=1 pnpm --filter web test tests/devnet.test.ts`. It skips when the service is unreachable.

## Home page evidence

Every figure on the home page is computed from a committed recording or a live read when the page renders. `lib/evidence.ts` shapes the recordings. Nothing in it is a typed-in count.

- The hero matrix draws one cell per claim in `packages/harness/last-run.json`, in catalogue order. Sorting by outcome moves cells and never changes a result. Hover or focus a cell to read its recorded reason. Arrow keys move by visual rows. The legend highlights one outcome.
- The live status line shows the latest `flop_get_stats` block with its age from the browser clock. It reads last known when the source failed or the value is older than a minute.
- The settlement specimen runs the verifier's `checkArithmetic` over the first 20 rows of `packages/verifier/fixtures/settlements-0.json`. Choosing a tick swaps the raw integer strings as whole values. They are grouped for reading and never pass through floating point.
- The promise ledger places four documented promises next to recorded harness claims and verifier checks from `packages/verifier/fixtures/channel-1.json`. A missing result shows as not recorded.
- The signature card verifies the recorded pull request proof in the browser with the same `verifyContribution` call as `/about`. Its flip control changes the first signed byte and checks again.
- The social image renders the same matrix from the same recording at build time.

## Contribution verification

`/provenance` reads GitHub's public pull request API directly in the browser. Pages are cached in memory and session storage for five minutes. Pagination is explicit. HTTP 403, 429 and 5xx pause further requests. Failed refreshes retain dated cached results. No access token is requested.

`lib/did.ts` decodes base58btc, checks the `ed01` multicodec prefix and imports the public key into WebCrypto. The exact UTF-8 manifest bytes are verified with Ed25519. The UI pins the contributor DID and checks the signed commit and branch against the current PR head. Its tamper control flips one byte before verification. It never changes the displayed original manifest.

The build reader serves the orchestrator's root `SIGNATURE.json` at `/SIGNATURE.json`. It returns an empty response when absent and the page says `not signed in this build`. Vercel file tracing includes this file when it exists at build time. The file must be produced by the orchestrator before the deployment build. A deployed manifest must match the build commit.

`tests/fixtures/pull-request.json` records a public publisher proof with its raw response, source and time. Refresh it with `pnpm --filter web exec tsx scripts/record-provenance.ts`. Tests also generate throwaway Ed25519 keys in memory and exercise invalid signatures, changed heads and malformed manifests.

Check a signed checkout offline with Node 22.18 or later:

```sh
node scripts/verify-signature.mjs ./SIGNATURE.json .
```

This checks the pinned signer, commit, exact tracked file set and SHA-256 of checkout file bytes. It handles tracked symlink bytes without following their target. It rejects symlink parents. It needs no network or private key. Run it from a checkout of the signed commit. Exit code zero means all checks passed. The importable `verifyCheckout` function accepts an explicit expected DID for throwaway-key tests; the CLI always pins the contributor DID.

## Vercel

- Framework preset: Next.js.
- Root directory: `apps/web`. Enable files outside the root directory for the workspace.
- Install command: `pnpm install` from the workspace root.
- Build command: `pnpm --filter web build` from the workspace root or `pnpm build` from `apps/web`.
- Output directory: Next.js default.
- Set `SITE_URL` to the canonical deployment origin for metadata and sitemap URLs. The local fallback is `https://flop-lab.vercel.app` and is not a deployment claim.
- `VERCEL_GIT_COMMIT_SHA` is supplied by Vercel. Locally the build reads `git rev-parse HEAD`. Missing commit metadata displays `unknown`.
- No API keys or wallet environment variables are used.

## What this does not verify

Public API observations are not proof of chain finality, inference correctness, miner capacity or uptime. Price-source counts include addresses in the response, not a claim that their quotes remain valid now. Devnet can reset.

A signature binds manifest bytes to the pinned public key. It does not prove code safety, identify a person or verify protocol claims. Browser checks do not hash repository files. Use the offline checker for checkout bytes. The signature does not cover the envelope's signing time, fingerprint or attestation sequence. Those fields are metadata. The room post's existence and retention are not checked. A valid PR manifest covers changed files, not the full repository.

Planned tools have not shipped. No write transaction, wallet or inference endpoint is used. Deployment behavior, DNS and the orchestrator's real deployed build signature must be checked after deployment.
