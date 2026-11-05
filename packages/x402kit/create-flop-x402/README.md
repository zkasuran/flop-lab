# FLOP payment reference template

How can I try the FLOP payment reference? This template starts the parent package's
read-only Hono service inside the flop-lab checkout. Inspect a recorded quote first,
then start the settlement preview with the development command below.

## Quick start

From the repository root with Node 22 and pnpm. This inspects recorded headers:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/x402kit build
node packages/x402kit/dist/cli.js inspect packages/x402kit/fixtures/headers.json
```

## Run the preview

Run this folder inside the flop-lab checkout. The dev command builds the parent package.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:3350/preview for dated devnet settlement arithmetic.
Use `src/demo.ts` in the parent package as the Hono service template.

## What this does not verify

This template is read-only. Payment execution is UNVERIFIED. There is no receiving wallet or chain settlement adapter. It cannot be copied outside the checkout without packaging the parent dependencies.
