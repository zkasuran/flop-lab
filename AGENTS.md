# flop-lab: rules for every contributor, human or agent

- pnpm workspaces. One package per tool. Each package exposes `check` (lint, types, tests) and, when it ships, `build`.
- TypeScript, strict. No `any` without a comment saying why. Node 22.
- Public APIs only: `https://api.flop.network/v1`, `https://mcp.flop.network/mcp`, the indexer behind `https://explorer.devnet.flop.network`, the SDK `@flop-labs/sdk`. Write transactions use throwaway devnet wallets only.
- Never state a number you did not measure. Tools record when and from where they measured.
- No em or en dashes anywhere. Short direct sentences.
- Every package has a README with: what it does, how to run it, what it does not verify.
- Licence: Apache-2.0. Add `SPDX-License-Identifier: Apache-2.0` to new source files.
