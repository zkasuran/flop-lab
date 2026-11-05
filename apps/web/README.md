# flop-lab web

The shared website for independent FLOP devnet tools. This first milestone supplies the shell, tool registry, theme controls, command palette and public signing identity. Planned tools link to their intended package folder. A folder can be absent until that tool ships.

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

Use `motion/react` for animation and `useReducedMotion` for a static alternative. `components/reveal.tsx` supplies a scroll reveal. Fonts are bundled locally through `next/font` without a build-time font request.

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

This milestone does not fetch devnet observations or verify contribution signatures. The provenance page says so. A displayed DID is a public identifier, not evidence of a successful signature check. Planned tool descriptions do not assert that those tools have shipped. No inference, transaction, miner performance or chain finality is verified.
