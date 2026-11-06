# Staking

What stake does my miner or validator need and what can it lose? This tool applies quoted FLOP devnet parameters to a declared capacity. It separates a documented scenario from indexed balances and current runtime eligibility.

## Quick start

From the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/staking build
node packages/staking/dist/cli.js miner --gflop 1
```

The package binary is `flop-staking`. The suite subcommand is `flop stake`. From this checkout, `pnpm --filter @flop-lab/cli exec flop stake --help` works after building the CLI package. The site workbench is `/staking`.

## Commands

```sh
node packages/staking/dist/cli.js miner --gflop 200 --commission 20 --json
node packages/staking/dist/cli.js validator
node packages/staking/dist/cli.js slash --offence fraud --stake 17560
node packages/staking/dist/cli.js slash --offence da-withholding
node packages/staking/dist/cli.js observed --json
node packages/staking/dist/cli.js observed --live --json
```

Reports are JSON. `--json` removes indentation. Omit `--stake` to inspect a rule without supplying a balance. Offence IDs are `liveness`, `fraud`, `dishonest-block`, `hard-attestation`, `da-withholding` and `validator-downtime`. Invalid input exits with an error. Partial public observations retain dated errors and empty results.

## Exact arithmetic

The recorded catalog was received from `flop_knowledge_get` at `https://mcp.flop.network/mcp` on 2026-11-06T00:29:50.264Z. The full raw response is in `fixtures/catalog.json`. Docs capture times are in `fixtures/staking-and-slashing.json` and `fixtures/protocol-parameters.json`.

The documented miner model is:

```text
required = base + ceil_base_unit(capacity * coefficient * revocation_blocks * surge_ppm / 1000000)
```

The recording quotes a 10,000 FLOP base, a 0.01 FLOP coefficient, 604,800 revocation blocks and a 1,250,000 ppm surge factor. Applying all factors gives 7,560 FLOP per calibrated GFLOP/s. The calculator uses decimal strings and bigint base units of 10^-18 FLOP. It rounds the final capacity bond upward once. This is a conservative sizing convention, not a claim about runtime rounding. Inputs support at most 18 decimal places. Overflow beyond u128 base units is rejected.

The recorded miner unbonding period is 604,800 blocks. The validator period is 1,814,400 blocks. Seconds are derived at the quoted target cadence of one second per block. They are not a withdrawal deadline.

The validator baseline is 1,200,000 FLOP. The catalog defines the effective floor as `max(baseline, k * V_booked)`, ratcheted. The baseline alone does not establish eligibility. The observed report checks the indexed current minimum against it.

The retained commission cap is 20 percent. The catalog explicitly marks it deprecated by D-0530. A within-cap result checks legacy data; it does not endorse new delegated staking. The docs disallow operator delegation while the catalog describes feature-gated devnet sponsorship. Both statements are retained in the report.

## Slashing

Each offence carries its source quotation and capture time. Liveness uses the documented 1-5 percent interval. Fraud and HARD-tier attestation failure use the quoted full-slash rate. Extended validator downtime uses the catalog's 5 percent rate followed by removal. The dishonest-block and DA-provider rows do not specify a numeric rate, so their loss remains unknown.

Loss intervals round outward to base units. The supplied balance represents a scenario's slashable stake, not an observed slashable ledger. The docs route slashed collateral to the FLOP Foundation account. On-chain cryptographic evidence is required for a fraud conviction. This tool never declares an operator guilty.

## Observations

The recorded report reads a bounded miner page, a bounded sponsor-position page and staking totals. Each raw response retains its URL and receipt time. Introspection recordings document the sponsor query. Regenerate with:

```sh
pnpm exec tsx packages/staking/scripts/discover.ts
pnpm exec tsx packages/staking/scripts/record-observations.ts
```

`gnMax` supplies the indexed capacity scenario. Missing calibration is `UNVERIFIABLE`. Both self-only and self-plus-sponsored comparisons are shown. The latter is conditional on devnet feature state and active-principal semantics. Legacy delegated stake is kept separate to avoid double counting. Position principal is checked against its original amount. An unbonding interval comparison uses `unlockBlock - updatedBlock`; the update block is not proof of the unbond request.

The sponsor query stops at one page of 100 positions. It is not a network total. Miner pagination reports whether its page is complete. Sequential observations are not a same-block snapshot.

[Network issue #75](https://github.com/flop-labs/network/issues/75) concerns runtime `MinerStaking::TotalStake`. The public indexer's `miners.totalStake` is a different field. It is compared with reported components without claiming to reproduce or fix that issue. A same-hash runtime storage proof is unavailable here.

Live reads use the shared MCP client and fixed explorer URLs. Calls are spaced by 500 ms. Each request has a 12-second deadline and a 200,000-byte response ceiling. Retryable MCP failures and explorer 429/5xx responses get one retry. The run is capped at six HTTP requests. Successful reports cache for 30 seconds per observer instance. Failed reports are not cached. Offline replay makes no requests. There is no polling.

## Library

```ts
import { minerStake, parameters, recordedReport, createObserver } from "@flop-lab/staking";

const scenario = minerStake("1", parameters);
const recorded = recordedReport();
const live = await createObserver().run();
```

Public calculations accept sourced parameters. The bundled parameters fail closed if a required catalog row is missing or its expression changes. Quotations normalize long dash typography to ASCII hyphens. Original response bytes remain in the JSON recordings.

## Checks

```sh
pnpm --filter @flop-lab/staking check
FLOP_LIVE=1 pnpm --filter @flop-lab/staking exec vitest run
```

Tests cover recorded responses, empty data, hostile decimals, overflow, missing fields, exact thresholds, loss intervals, retries and caching. The opt-in live test skips when public sources are unavailable. Mutation evidence is retained with the pull request.

## What this does not verify

This does not verify runtime storage, calibration leases, capacity proofs, finality, withdrawability, actual slash events or the active feature flags. Catalog values are not authenticated runtime constants. The docs mark capacity economics under reconciliation. Governance can change them and devnet can reset. The tool does not create wallets, sign transactions, stake funds or promise returns.
