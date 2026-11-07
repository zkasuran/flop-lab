# flop-lab

Independent tools for the FLOP Network devnet. They read what the network publishes, check it and say plainly what stays unverified.

Live site: **https://flop.zkasuran.dev**

FLOP is a blockchain where AI agents pay GPU miners for inference. Miners submit proofs of the work, anyone can challenge a session for about seven days and proven fraud costs the miner its whole stake. Those are strong promises and the devnet is the place to test them. This repository is one person's attempt to do that with tools anyone can run.

It is a community project. It is not an official FLOP product, it uses no private access and nothing here touches mainnet funds. The devnet is disposable and may reset, so every figure the tools print carries the time and the source it came from.

## What we found so far

- A settlement is only as good as its arithmetic. On the live tape, 20 settlements gave 40 passing escrow and price checks, 0 failures. The same verifier also lists what it cannot check from outside: pricing agreed with the miner, transcript inclusion, hardware quotes and the exact challenge window.
- Of 64 documented claims the conformance harness checked on one run, 34 passed, 3 failed, 22 could not be verified from outside and 5 were skipped. One failure is filed upstream: [`flop_knowledge_get` returns fields its own output schema forbids](https://github.com/flop-labs/network/issues/87).
- The gateway lists 18 miner addresses as price sources. Only a few have any settlement history and every price source is marked `devnet-nominal`. A scoreboard can rank settlements. It cannot rank uptime and says so.

These are dated observations, not conclusions about the network. Run the tools and get your own.

## Try it

You need Node 22 and pnpm. No wallet, no key, no account.

```sh
pnpm install
pnpm --filter @flop-lab/verifier build
node packages/verifier/dist/cli.js tape --limit 20       # arithmetic over recent settlements
pnpm --filter @flop-lab/scoreboard build
node packages/scoreboard/dist/cli.js rank                # miners ranked from observed settlements
pnpm --filter @flop-lab/harness start run --only gateway-contract --max-requests 8 --max-flop 0
```

## The tools

### One command for the suite

From this checkout with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/cli... --workspace-concurrency=1 run build
node packages/cli/dist/cli.js which miner reliability
```

`node packages/cli/dist/cli.js help score` shows the selected tool's options. `list --json` lists the registry. `completions bash`, `completions zsh` and `completions fish` print shell completion scripts. Put `--json` last when running a tool. The wrapper preserves child exit codes. See the [CLI guide](packages/cli/README.md) for shell setup, the output contract and measured git-URL packaging limits.

Each answers one question, has its own README with the limits and has a page on the site.

| Question                                     | Tool                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does this settlement add up?                 | [`verifier`](packages/verifier): replays public evidence offline, with exact integer arithmetic. PASS, FAIL or UNVERIFIABLE per check, never a guess.         |
| Which miner should I use?                    | [`scoreboard`](packages/scoreboard): ranks miners from settlements and price sources, with the confidence of every score and a router that explains its pick. |
| Does the network do what the docs say?       | [`harness`](packages/harness): a catalogue of documented claims, each checked with a bounded number of requests and no funds.                                 |
| How do I stop an agent overspending?         | [`spendguard`](packages/spendguard): budgets, price ceilings and an append-only ledger in front of the SDK.                                                   |
| What is about to leave its challenge window? | [`challenger`](packages/challenger): tracks windows and drafts review dossiers. It never files a dispute.                                                     |
| Can I run this from a Kestra flow?           | [`plugins/kestra-flop`](plugins/kestra-flop): read-only network tasks and a settlement trigger.                                                               |
| How does an API charge per call in FLOP?     | [`x402kit`](packages/x402kit): in progress.                                                                                                                   |

All of them read through one small client, [`packages/mcp`](packages/mcp), which parses the hosted server's event stream, retries politely and ships recorded fixtures for tests.

## How it is built and how to trust it

Each tool was built by a separate AI agent working from a written brief, in its own git worktree, with checkpoints on disk. An agent cannot push, open a pull request or touch a key. A gated tool does that: it refuses a change without a green build, tests, honest wording and a README that says what is not verified. A person merges.

Every pull request is signed with one Ed25519 key, an identifier of the form `did:key`:

```
did:key:z6MkoA8xuzKJRGtHa5hr6znFCZq164mb45JHx6kktdJ6tMdL
```

The signature covers the hash of every changed file and the recipe to check it is in the pull request. The site footer verifies signatures in your browser and the deployed build carries a signed `SIGNATURE.json` for the whole repository. A signature proves who published the bytes. It does not prove the code is right. That is what the tests, the mutation checks and your own run are for.

## Repository map

```
apps/web            the site (Next.js, Motion)
packages/           mcp, verifier, scoreboard, harness, spendguard, challenger
plugins/kestra-flop the Kestra plugin (Java)
scripts/            offline signature checker
```

## Licence

Apache-2.0. See `LICENSE`.
