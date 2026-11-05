# Recorded harness inputs

`catalogue-*.json` records raw public responses used to establish the claim catalogue.
`run-*.json` records each HTTP attempt from the last committed live run.
Each envelope contains the exact request, raw response, source URL and observation time.
JSON Unicode escapes preserve raw text on decoding.

Regenerate from `packages/harness` with `pnpm exec tsx scripts/catalogue.ts` then
`pnpm record`. Review catalogue changes before committing them.
Raw responses are bounded below the repository fixture size limit.
These fixtures describe one observation. They do not establish current network state.
