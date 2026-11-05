# flop-lab web

The shared website for independent FLOP devnet tools. It shows dated devnet observations, planned tool status and local Ed25519 contribution checks. Planned tools link to their intended package folder. A folder can be absent until that tool ships.

## Run

Use Node 22 and the workspace version of pnpm. From the repository root:

```sh
pnpm install
pnpm --filter web dev
pnpm --filter web check
pnpm --filter web build
pnpm --filter web start
```

Open http://localhost:3300. Stop the dev server before starting the production server. Press `/` or Cmd-K to find a tool. Use arrows to move through results and Escape to close.

## Add a tool page

Add `app/<slug>/page.tsx` and export Next.js metadata with a page title and description. Update one entry in `content/tools.ts`. Set `status` to `alpha` or `live` only when the page works. The registry drives cards, palette destinations and the sitemap. A live status is a release label, not a service uptime claim.

Use `app/tokens.css` for colours, type, spacing, radii and motion timing. Shared classes include `section`, `section-heading`, `panel`, `button`, `quiet-button`, `muted`, `mono`, `badge`, `success`, `warning` and `error`. Do not restyle the shell. The layout includes the independent-project notice and proof footer on every page.

Use `motion/react` for animation and `useReducedMotion` for a static alternative. `components/motion.tsx` supplies `ReadingReveal`, `ReadingPath`, `MotionButton`, `MotionLink`, `ObservedNumber` and `Disclosure`. The shared `RouteSurface` animates route arrivals and keeps content readable throughout. `components/reveal.tsx` preserves the existing reveal API. Fonts are bundled locally through `next/font` without a build-time font request.

`ReadingPath` uses scroll position to fill an explanatory line. It is reading progress, not a verification state. Reduced motion shows the full line. `ObservedNumber` moves the measured value as a whole; it never counts through invented intermediate values. Disclosure contents mount immediately and use layout motion. Controls act on the same click that starts their feedback. All timed transitions finish within 600 ms. There is no ambient loop.

## Observations and request budget

The home page uses `@flop-lab/mcp` for `flop_get_stats` and `flop_list_settlements` with a page limit of five. The keyless gateway model list supplies distinct miner addresses from `x-flop.price_sources`. The displayed settlement is the greatest timestamp in that returned page. No full-history claim is made.

The server caches each source for 30 seconds and coalesces concurrent reads. Next.js revalidates the page every 30 seconds. Visible browser tabs request a refreshed page on the same interval. A healthy uncached read makes three public requests. MCP calls are spaced by the shared client. Each source gets one attempt per refresh, with an eight-second response deadline and a 200 KB response limit. Failures back off from 30 seconds to five minutes. `Retry-After` can extend that wait.

Last-good values are retained per server process. A cold process falls back to the committed real recordings in `tests/fixtures/`, with their original measurement times. This fallback is explicitly labelled last known. An empty successful response replaces the previous list. Empty lists and missing fields never become invented counts. Instances do not share their in-memory caches.

The hero plots one node per recorded price-source address. A grid orders addresses by hash, not geography or a performance score. Filled centres occur in the returned settlement sample. The sample bar is the number of distinct price-source addresses found in that page divided by the total distinct price-source addresses. The exact numerator and denominator remain readable while the bar moves. Missing sources show an unavailable comparison. Empty price-source lists show zero addresses without dividing by zero.

The map can filter to matching addresses. Its disclosure lists full addresses and both source times. A missing match is only absence from this page. New settlement observations pulse once. Motion stops when the map is off-screen or the tab is hidden. Reduced motion uses instant changes with the same numbers and labels. Observations in the comparison can have different measurement times; they are not an atomic network snapshot.

Refresh the raw recordings with `pnpm --filter web exec tsx scripts/record-devnet.ts`. Review the recorded time and update the golden test expectations deliberately. Run the optional keyless live check with `FLOP_LIVE_TEST=1 pnpm --filter web test tests/devnet.test.ts`. It skips when the service is unreachable.

## Contribution verification

`/provenance` reads GitHub's public pull request API directly in the browser. Pages are cached in memory and session storage for five minutes. Pagination is explicit. HTTP 403, 429 and 5xx pause further requests. Failed refreshes retain dated cached results. No access token is requested.

`lib/did.ts` decodes base58btc, checks the `ed01` multicodec prefix and imports the public key into WebCrypto. The exact UTF-8 manifest bytes are verified with Ed25519. The UI pins the contributor DID and checks the signed commit and branch against the current PR head. Its tamper control flips one byte before verification. It never changes the displayed original manifest.

The build reader serves the orchestrator's root `SIGNATURE.json` at `/SIGNATURE.json`. It returns an empty response when absent, and the page says `not signed in this build`. Vercel file tracing includes this file when it exists at build time. The file must be produced by the orchestrator before the deployment build. A deployed manifest must match the build commit.

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
