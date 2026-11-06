# DID trail page

What has this key signed? `/did` starts with dated real notes, room responses and GitHub search results. WebCrypto verifies the retained signatures in the browser. A local tamper control flips one signed byte.

## Run

From the repository root:

```sh
pnpm --filter web build
pnpm --filter web exec next start --port 3480
# Open http://localhost:3480/did
```

The initial page uses bundled observations. `Trace DID` performs one bounded lookup through `/did/data`. The route shares the DID package's disk cache, request budget and cooldowns. It caches HTTP responses for an hour. The browser validates the returned observation envelopes and reconstructs the trail before checking signatures.

The timeline rail tracks reading. Filters and disclosures use layout transitions. Counts show final observed values immediately. Their bars animate the same ratios. Reduced motion keeps all information and removes travel. The tool marker uses the shell's shared route transition.

## What this does not verify

The page does not prove a complete history, note ownership, replay freshness or trustworthiness. It does not check current PR heads or file hashes. Counts refer to original artifact checks. Card tamper controls are independent negative controls.
