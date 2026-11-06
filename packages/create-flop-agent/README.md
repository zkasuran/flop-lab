# Agent starter

How do I start a FLOP agent that is safe by default? Generate a small TypeScript project that checks devnet health, discovers models, routes with the scoreboard, admits spending through Spendguard and checks settlement evidence with the verifier. Its default run replays dated public inputs. Paid transport is an explicit extension point.

## Quick start

From an installed flop-lab checkout with Node 22 and pnpm:

```sh
pnpm --filter @flop-lab/create-flop-agent build
node packages/create-flop-agent/dist/cli.js /tmp/my-flop-agent --max-flop 0.1
pnpm --dir /tmp/my-flop-agent install --no-frozen-lockfile && pnpm --dir /tmp/my-flop-agent check && pnpm --dir /tmp/my-flop-agent start
```

Choose a new destination with an existing parent. Existing paths and symlink parents are refused. The generator never overwrites a project. The unified command is `node packages/cli/dist/cli.js start <new-dir>` after building the CLI package.

## Modes and limits

Generation makes no network requests. The generated `pnpm start` replays raw observations at their capture time. `pnpm start --observe` requests fresh public observations while remaining a dry run. There is no write-enabled CLI flag. Missing routes and missing quotes are explicit results. Network and schema failures exit with an error.

`--max-flop` defaults to `0.1`. A hard ceiling in generated source refuses values above `1`. These are policy settings, not measured prices. Amounts use exact decimal arithmetic with up to 18 places. Discovery prices are never used as quotes.

The generated project includes:

- A bounded agent loop with no credentials or key reader.
- A fresh `flop_health` check for the exact `FLOP Devnet` label before discovery and immediately before a paid adapter.
- A scoreboard route restricted to discovery's served model and miner pairs.
- An expiring quote bound to the route and the maximum amount at risk.
- A Spendguard ledger with task, hourly, daily and total limits. Reuse `requestId` for a dry run and its matching operation. Keep the ledger across runs.
- Verifier checks for the adapter's returned channel. Failed or unverifiable checks remain incomplete. Reservations are not automatically refunded.
- A `.gitignore` for wallet files, local keys, environment files and the ledger.
- Its own offline tests and strict TypeScript configuration.

No paid adapter ships. The `paidCall` callback is for a future trusted integration that enforces the supplied maximum at the protocol boundary. Its default throws. Tests use fake callbacks and never send a transaction.

Run the generated `pnpm ledger:init` once before rehearsing an explicit quote. This creates the local ledger and its head anchor without replacing either. Missing ledger files during a turn are errors, not an automatic budget reset.

## Importable API

```ts
import { generateAgent } from "@flop-lab/create-flop-agent";

await generateAgent({ directory: "/tmp/my-flop-agent", maxFlop: "0.1" });
```

The generator uses `link:` dependencies to the installed source checkout and its locked TypeScript toolchain. `--workspace <path>` selects another installed flop-lab checkout. This works outside a pnpm workspace while the packages remain private. Keep the checkout at that path. After publication, replace the links with tested published versions and their documented exports. No registry installation command for these private packages is advertised.

## Evidence and checks

`fixtures/devnet.json` holds dated raw MCP health and discovery text. The adjacent JSON files hold the scoreboard collector's raw observations. Capture time and source travel with every record. The site shows these recorded inputs rather than fetching on each visit.

```sh
pnpm --filter @flop-lab/create-flop-agent check
pnpm --filter @flop-lab/create-flop-agent record
pnpm exec tsx packages/create-flop-agent/scripts/verify.ts /tmp/starter-mutation.log
```

`check` generates into a temporary directory, installs local workspace links offline, type-checks the generated project and runs its tests and default command. The mutation script removes the initial devnet guard, requires a failing test result, restores it and requires green checks. It records command output and generation timing.

Health has a 30-second freshness bound. The scoreboard collector caches for 60 seconds. The shared MCP client spaces calls and applies bounded backoff to 429 and 5xx responses. Recorded replay performs no network requests. Live request attempts and run duration are printed by the generated command.

## What this does not verify

A service-reported chain label is not a genesis-hash or consensus proof. Recorded discovery is not a current offer. Routing does not guarantee latency, uptime or price. This starter does not perform inference, create a wallet or implement paid transport. A future adapter must bind itself to the correct devnet and enforce the quoted maximum. Public settlement checks do not establish correct inference, authenticated hardware or finality. Local accounting cannot constrain an adapter that ignores the quote or survive deliberate ledger deletion.
