# flop-lab web

What can I check about FLOP from outside? This site brings the independent devnet tools together. It is built on FLOP's public interfaces and is not an official FLOP product. Start with dated network readings, open a tool to inspect its evidence or check a contribution signature in your browser.

## Site map

- `/` is the landing page: the pitch, a constellation drawn from the gateway's price sources, dated readings, the recorded settlement tape, the six sections, a pinned walk through one check, three findings, the tool index, start commands and a signature you can check.
- `/network` holds the devnet readings, the price-source map and links to the Observe tools.
- `/findings` holds the claim matrix, the three findings with their evidence and the promise ledger.
- `/sections/<id>` lists one section's tools with dated evidence.
- `/about` and `/provenance` explain how the project is built and verify its signatures.
- Every available tool has its own page. The registry in `content/tools.ts` lists them.

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

Use `app/tokens.css` for colours, type, spacing, radii and motion timing. Token names are stable so tool pages inherit theme changes. `--pass`, `--fail`, `--unverifiable` and `--skipped` give each result one colour across the site. Unverifiable results also carry a hatch and skipped results a dashed outline, so colour is never the only signal. `--accent-2` and `--gradient-signal` are decoration for headlines, glows and rules. Results never use them. `--glass`, `--glass-strong` and `--glass-solid` are surface fills from translucent to near opaque. Menus and dialogs use opaque fills so page text never shows through. Shared classes include `section`, `section-heading`, `page-heading`, `panel`, `frame`, `button`, `quiet-button`, `icon-button`, `text-link`, `muted`, `mono`, `badge`, `status-dot`, `kbd`, `source-chip`, `signal-text`, `success`, `warning` and `error`. `frame` adds a soft top light to instrument cards. `source-chip` keeps a value next to its capture time and link. Do not restyle the shell. The layout includes the header, the context navigation on tool and section pages, the related tools strip and the footer with the independent-project notice on every page.

### Page rules

- One container width and one section rhythm (`--section-space`) on every page.
- A landing section has an eyebrow, a heading of about eight words, one lede sentence, one visual and at most one main action. `BlockHeading` in `components/landing` is that pattern. Story pages use `PageHero`.
- Every number carries its source and capture time, through `source-chip`, a dated note or the existing observation source lines. Limits sit in a `Disclosure` labelled "What this does not prove".
- Arrows and marks come from `components/icons.tsx`, so they render the same on every system.
- A tool page keeps one `h1` from `ToolHeader`. The shell adds the section switcher above it and related tools below it.

### Motion

Use `motion/react` for animation and `useReducedMotion` for a static alternative. `components/motion.tsx` supplies `RouteSurface`, `Magnetic`, `SplitWords`, `ReadingReveal`, `ReadingPath`, `ReadingSteps`, `MotionButton`, `MotionLink`, `ObservedNumber`, `SwapValue`, `Disclosure` and the `useSeen` hook. `components/reveal.tsx` preserves the existing reveal API. Fonts are bundled locally through `next/font` without a build-time font request.

- Route changes use React's `ViewTransition`. The old page fades out and the new one rises in. The first paint is never animated. `ToolMark` with `travel` is a named view transition. The header marker always travels. A card marker travels only while its card is hovered or focused, so the followed card morphs into the header and no other card moves. Render at most one travelling marker per slug on a page. Browsers without view transitions switch at once.
- Scroll reveals, the hero parallax, the footer wordmark and the page progress line use CSS scroll and view timelines. Content stays visible where the browser lacks them.
- The landing walk through a check pins on wide screens and advances with scroll through Motion `useScroll`. Narrow screens and reduced motion show every step in order.
- Story pages (`/`, `/network`, `/findings`, `/about`, `/provenance` and section pages) add Lenis smooth scrolling and a cursor that replaces the system cursor. Both run only for a mouse or trackpad and never under reduced motion. The cursor also stays off under forced colours. Inputs keep the text cursor and open dialogs keep the system cursor. Tool pages keep native scrolling and the system cursor, so their workbenches stay calm. `components/shell/routes.ts` lists the story pages.
- Main actions wrapped in `Magnetic`, such as the header button, lean a few pixels toward a mouse pointer on every page. Reduced motion keeps them still.
- Cards marked `data-spotlight` get a glow that follows the pointer. Add `data-cursor="open"` or `data-cursor-label` to give the cursor a label.
- Interface feedback finishes within 600 ms. Decorative layers may loop: the constellation, the settlement ticker, the gradient orbs and the live ring on the block reading. They pause off-screen or in hidden tabs where they draw on a canvas, and they stop under reduced motion.

`ReadingPath` and `ReadingSteps` use scroll position to fill an explanatory line. It is reading progress, not a verification state. Reduced motion shows the full line. `ObservedNumber` and `SwapValue` move a recorded value as a whole; they never count through invented intermediate values. `useSeen` treats content that starts on screen as already seen, so a first paint never hides a final value. Disclosure contents mount immediately and use layout motion. Controls act on the same click that starts their feedback. The static film grain never moves.

### Navigation

The header holds the Tools mega menu, the Network and Findings pages, the Trust menu, the latest block reading, search, source, theme and the main action. The mega menu lists the six sections in a rail. Hovering or focusing a section shows its tools with their question and status. Planned tools link to their source. Menus open on hover after a short intent delay, on click and from the keyboard. Escape closes a menu and returns focus to its trigger. Below 960 px the header collapses into a full-screen menu. It locks page scroll and takes the page behind it out of the tab order until it closes.

The block reading polls `/api/pulse` every 30 seconds while the tab is visible. That route returns the stats observation from the same cached snapshot as the home page, so it adds no public requests beyond that cache. It reads Last known when the source failed or the value is older than a minute.

On a tool page, the context bar lists the other available tools in its section with previous and next. On a section page it switches between the six sections. The palette groups results into sections, pages, tools and docs. Groups follow the rank of their best match, so the highlighted first row is the result Enter opens from the input. Arrows move focus, Home returns to the input and Escape restores focus to the control that opened it. The theme control uses a 520 ms view transition from the pointer where the browser supports it and switches at once otherwise.

## Observations and request budget

The home page, `/network`, `/findings` and `/api/pulse` share one snapshot. It uses `@flop-lab/mcp` for `flop_get_stats` and `flop_list_settlements` with a page limit of five. The keyless gateway model list supplies distinct miner addresses from `x-flop.price_sources`. The displayed settlement is the greatest timestamp in that returned page. No full-history claim is made.

The server caches each source for 30 seconds and coalesces concurrent reads. Next.js revalidates these pages and the pulse route every 30 seconds. Visible browser tabs on `/` and `/network` request a refreshed page on the same interval. A healthy uncached read makes three public requests. MCP calls are spaced by the shared client. Each source gets one attempt per refresh, with an eight-second response deadline and a 200 KB response limit. Failures back off from 30 seconds to five minutes. `Retry-After` can extend that wait.

Last-good values are retained per server process. A cold process falls back to the committed real recordings in `tests/fixtures/`, with their original measurement times. This fallback is explicitly labelled last known. An empty successful response replaces the previous list. Empty lists and missing fields never become invented counts. Instances do not share their in-memory caches.

The map on `/network` plots one node per recorded price-source address. A grid orders addresses by hash, not geography or a performance score. Filled centres occur in the returned settlement sample. The sample bar is the number of distinct price-source addresses found in that page divided by the total distinct price-source addresses. The exact numerator and denominator remain readable while the bar moves. Missing sources show an unavailable comparison. Empty price-source lists show zero addresses without dividing by zero.

The map can filter to matching addresses. Its disclosure lists full addresses and both source times. A missing match is only absence from this page. New settlement observations pulse once. Motion stops when the map is off-screen or the tab is hidden. Reduced motion uses instant changes with the same numbers and labels. Observations in the comparison can have different measurement times; they are not an atomic network snapshot.

Refresh the raw recordings with `pnpm --filter web exec tsx scripts/record-devnet.ts`. Review the recorded time and update the golden test expectations deliberately. Run the optional keyless live check with `FLOP_LIVE_TEST=1 pnpm --filter web test tests/devnet.test.ts`. It skips when the service is unreachable.

## Home page evidence

Every figure on the home page, `/findings` and `/network` is computed from a committed recording or a live read when the page renders. `lib/evidence.ts` shapes the recordings. Nothing in it is a typed-in count.

- The hero constellation draws one node per price-source address in the snapshot, placed on an orbit by address hash. Filled nodes appear in the sampled settlement page. Pulses replay that page from the core to each miner and are labelled as replays, not live traffic. A ripple marks a new block reading. Hover a node to read its address and whether it is in the sample. The loop pauses off-screen and in hidden tabs. Reduced motion draws one still frame.
- The hero readings show the latest `flop_get_stats` block with its age from the browser clock, the price-source count with its sample match and two recorded figures with their capture dates. A reading is last known when the source failed or the value is older than a minute.
- The ticker lists the first 20 rows of `packages/verifier/fixtures/settlements-0.json` with the verifier's two arithmetic results. The walk through a check shows the first of those rows: its source, its escrow equation as raw integer strings and its results.
- On `/findings`, the matrix draws one cell per claim in `packages/harness/last-run.json`, in catalogue order. Sorting by outcome moves cells and never changes a result. Hover or focus a cell to read its recorded reason. Arrow keys move by visual rows. The legend highlights one outcome.
- On `/findings`, the settlement specimen runs the verifier's `checkArithmetic` over the same 20 rows. Choosing a tick swaps the raw integer strings as whole values. They are grouped for reading and never pass through floating point.
- On `/findings`, the promise ledger places four documented promises next to recorded harness claims and verifier checks from `packages/verifier/fixtures/channel-1.json`. A missing result shows as not recorded.
- The signature card verifies the recorded pull request proof in the browser with the same `verifyContribution` call as `/about`. Its flip control changes the first signed byte and checks again.
- The social image renders the claim matrix from the same recording at build time.

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

The constellation, the settlement ticker and the walk through a check draw recorded or sampled data. Their motion is decoration. Pulses and ripples do not show live traffic, block timing or network activity. "Built on FLOP" means the tools read FLOP's public interfaces. It is not an endorsement by the FLOP project.

A signature binds manifest bytes to the pinned public key. It does not prove code safety, identify a person or verify protocol claims. Browser checks do not hash repository files. Use the offline checker for checkout bytes. The signature does not cover the envelope's signing time, fingerprint or attestation sequence. Those fields are metadata. The room post's existence and retention are not checked. A valid PR manifest covers changed files, not the full repository.

Planned tools have not shipped. No write transaction, wallet or inference endpoint is used. Deployment behavior, DNS and the orchestrator's real deployed build signature must be checked after deployment.
