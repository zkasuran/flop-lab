# My FLOP agent

How do I start an agent without sending a paid request? This project replays recorded devnet health, model discovery and scoreboard inputs. It stops when a route or a spending quote is missing.

## Quick start

Run from this generated directory with Node 22 and pnpm. Keep the source flop-lab checkout installed.

```sh
pnpm install --no-frozen-lockfile
pnpm check
pnpm start
```

`pnpm start --observe` reads the public devnet services. It remains a dry run. `--dry-run` is accepted explicitly. Other arguments fail closed. The program performs one bounded turn and exits. Network failures produce an error with a nonzero exit code.

## Files and extension points

- `src/main.ts`: the bounded loop and explicit read-only modes.
- `src/guards.ts`: exact devnet health check and a hard ceiling of 1 FLOP. The generated default is **MAX_FLOP** FLOP. These are policy settings.
- `src/agent.ts`: discovery, scoreboard routing, Spendguard admission and verifier checks.
- `src/inputs.ts`: live reads and dated fixture replay through the shared MCP client.
- `test/agent.test.ts`: offline safety checks including a mainnet rejection.
- `fixtures/`: raw public responses with source and time. Recorded time is used only for offline replay.

Discovery and gateway model names are joined by lowercase ID. A route must appear in discovery's served miner list and pass the scoreboard's default evidence policy. A historical price or discovery price is never promoted to a quote. No eligible miner is a valid result.

`runTurn` accepts a trusted `paidCall` adapter and a matching expiring quote as extension points. No paid adapter, key reader, signer or wallet ships here. Adding one requires enforcing the quoted maximum at the protocol boundary, using a throwaway devnet wallet and keeping it outside the repository. The supplied health report only names the network. Independently bind the adapter to the correct chain before enabling it.

Spendguard reserves the full amount at risk before an adapter runs. Total, daily, hourly and task ceilings all use the configured maximum. The per-GFLOP price limit is a policy setting in `guards.ts`. A matching dry run is required by Spendguard. Reservations remain charged after failures or incomplete verification. Preserve the ledger across runs. Editing the code or deleting the ledger defeats local accounting.

The verifier checks the returned channel's evidence. It reports failed and unverifiable checks without treating either as success. It never releases budget on the basis of a report.

Health expires after 30 seconds and is rechecked immediately before an adapter call. The scoreboard collector caches reads for 60 seconds. The shared MCP client spaces requests and retries 429 and 5xx responses with bounded backoff. Generation and fixture replay do not access the network.

## Workspace dependencies

Before rehearsing an explicit quote, run `pnpm ledger:init` once to create the local ledger and its head anchor. Existing files are refused. A missing ledger during a turn is an error. Reuse the same `requestId` for the dry run and its matching operation.

The `link:` dependencies point at the source checkout and its locked TypeScript toolchain. Install that checkout first. Keep it at the same path. These packages are private and their exports currently target TypeScript source. When published, replace the package and toolchain links with tested published versions and follow their exported entry points. Do not run an unpublished `npx` command.

## What this does not verify

The health service's chain label is not a genesis-hash or consensus proof. Fixtures are historical observations and are not current offers. Scoreboard routing is not a price, latency or uptime guarantee. This project does not send inference requests, manage wallets or implement paid transport. Public settlement checks do not establish correct inference, hardware attestation or finality. Local policy cannot constrain an adapter that ignores its quote or protect a ledger from its owner.
