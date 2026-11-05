# FLOP payment reference template

Run this folder inside the flop-lab checkout. It uses the built parent package.

```sh
pnpm install
pnpm --filter @flop-lab/x402kit build
pnpm dev
```

Open http://127.0.0.1:3350/preview for dated devnet settlement arithmetic.
Use `src/demo.ts` in the parent package as the Hono service template.

## What this does not verify

This template is read-only. Payment execution is UNVERIFIED. There is no receiving wallet or chain settlement adapter. It cannot be copied outside the checkout without packaging the parent dependencies.
