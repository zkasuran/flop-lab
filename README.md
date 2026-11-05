# flop-lab

Open tools for the FLOP Network devnet: how reliable are the miners, does the protocol hold under stress, and how does an agent spend FLOP safely.

Everything here reads public, keyless data or uses throwaway devnet wallets. Nothing here touches mainnet funds. The devnet is disposable and may reset, so the tools say what they observed and when.

| Package | What it does | State |
|---|---|---|
| `apps/web` | The site: one page per tool, live data, and the proof that signs this repository's pull requests | planned |
| `packages/scoreboard` | Miner reliability scoreboard and a router that picks a miner | planned |
| `packages/harness` | Conformance and chaos harness that files reproducible protocol bug reports | planned |
| `packages/verifier` | Independent settlement and receipt verifier | planned |
| `packages/spendguard` | Budget policy layer over agent wallets | planned |
| `packages/x402kit` | Pay-per-call HTTP service and template using x402 | planned |
| `packages/challenger` | Audit agent that checks settled sessions and files disputes | planned |
| Kestra plugin | Budgeted, verified inference as a Kestra task | planned, own repository |

## Provenance

Every pull request in this repository is opened by a gated tool that signs a manifest of the changed files with one Ed25519 key. The public half is a `did:key`:

```
did:key:z6MkoA8xuzKJRGtHa5hr6znFCZq164mb45JHx6kktdJ6tMdL
```

The signature and the recipe to check it sit in each pull request description. The site footer shows the same key and verifies a signature in the browser.

## Licence

Apache-2.0. See `LICENSE`.
