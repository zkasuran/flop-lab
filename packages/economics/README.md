# Economics

Do rewards, emission and inference fees follow the spec? This tool calculates the pinned yellowpaper schedule with exact integers and compares it with dated public indexer fields. It marks missing evidence UNOBSERVABLE.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile && pnpm --filter @flop-lab/economics build && pnpm --filter @flop-lab/cli build
pnpm --filter @flop-lab/economics exec flop-economics compare --json
pnpm --filter @flop-lab/cli exec flop economics reward 63072000 --json
```

## Calculators

```sh
pnpm --filter @flop-lab/economics exec flop-economics supply 378431999
pnpm --filter @flop-lab/economics exec flop-economics payment 100 --fee 0.01 --tip 0
pnpm --filter @flop-lab/economics exec flop-economics compare --live --save observation.json
```

JSON amounts are decimal strings in base units, with 18 decimal places per FLOP. No exponent notation or silent rounding is accepted. Block N is inclusive. Supply means gross scheduled issuance, including genesis and both subsidy recipients. It is not measured circulating supply. The payment input is a user scenario, not a measured price.

`compare` replays the bundled recording by default. `--live` reads one bounded GraphQL query through `@flop-lab/mcp`. It samples the latest settlement page. It does not paginate history. The collector has a 30 second per-instance cache, 250 ms minimum request spacing and one retry with backoff on transient failures. Invalid or unavailable responses fail explicitly. `--save` retains the raw tool text, query, source and reception time and refuses to overwrite a file. Exit 1 means input or observation failure. A comparison containing DRIFT still exits 0.

## Formula ledger

Source: [yellowpaper pin 2a2cc82](https://github.com/flop-labs/yellowpaper/blob/2a2cc8218048a2933071bb2f45d75335560e39d8/yellowpaper.md). `fixtures/spec.json` records verbatim excerpts, line ranges, parameter blocks and retrieval time. Values come from the pinned parameter file and are checked against it in tests. The paper specifies a target protocol, not evidence that this devnet implements it.

- R9.2 quotes `era(b) = ⌊b / H⌋`. H is 63,072,000 blocks. The recorded schedule is 96, 48, 24, 12, 6 then 3 FLOP per block. After five halvings the floor continues forever. R9.7 states: "No block reward has been emitted at genesis". Thus `reward(0) = 0`; otherwise `reward(b) = max(floor_reward, initial_block_reward / 2^min(era(b), max_halvings))`.
- R9.3 calls the subsidy a "separate mint". Each recipient gets `8 / 2^era(b)` FLOP for `1 <= b < 315360000`, then zero. The fractional final era is calculated in base units. The quoted cumulative subsidy is `63,072,000 × (16 + 8 + 4 + 2 + 1) − 16`.
- R9.2 quotes cumulative emission `R₀·H·63/32 − R₀` through block 378,431,999. The tool derives `gross(N) = genesis + sum(reward(b) + 2 * subsidy(b), b = 1..N)` by summing era lengths, not by iterating blocks. Burns and other mint paths are excluded.
- R9.12 says "the four legs sum to 1000 ppt". Each pool is `reward * share_ppt / 1000`: miners 750, validators 100, agents 100 and stakers 50. Scheduled rewards divide exactly. This models pool totals. Individual stake-weighted recipients and onward pool payouts are excluded.
- R12.1a states "under-use MUST NOT be refunded" and requires 85% of settled payable to the miner and 15% to the validator pool. Appendix A specifies the audit allocation as "1% (10_000 ppm) of the settlement payment funded out of the 15% validator fee leg". The formulas are `miner = floor(P * 850 / 1000)`, `validatorPool = floor(P * 150 / 1000)`, `audit = floor(P * 10000 / 1000000)` and `validators = validatorPool - audit`.
- The cited paper does not fix between-pool integer dust allocation. The calculator floors each rational pool and reports `roundingDust = P - miner - validatorPool`. It does not assign this dust to a recipient. Comparison only reports exact MATCH when the rational target is integral. For nonintegral amounts, values outside floor..ceil are DRIFT and values inside are UNOBSERVABLE.
- Appendix D quotes "Chain inclusion fee = base fee + encoded-length fee + adjusted-weight fee". R9.6 assigns 100% of inclusion fees and tips to the author with zero burn. Given a fee and tip, `author = fee + tip`; `totalDebit = P + fee + tip`. These costs are separate from settlement shares.

## Fee map and limits

Successful cooperative spot settlement uses reserved escrow as payable. Non-delivery and upheld fraud return escrow to the agent. Failed or early close uses the R12.1d tariff P and routes `φ * (E - P)` to the Foundation, with `(1 - φ) * (E - P)` refunded. Those branches require tariff and channel state and are not calculator inputs. `unusedEscrow` is an indexer residual label, not proof of a refund or validator receipt.

Agent and staker emission pools are separate from inference fees. Labs and Foundation subsidies are separate from participant rewards. Storage deposits and slashes are separate flows. This tool does not sum them into payment revenue.

## Chain comparison

Every row is MATCH, DRIFT or UNOBSERVABLE against the pinned target. The report includes the source, reception time, sample size, block and channel when present. `stats` supplies the observed head only. `networkValue` contains contributor concentration. `termCurve` contains forward-market prices. None exposes token issuance or reward distributions. Their zero counts and missing prices are never substituted for supply or fees.

Only `cooperative: true`, `marketKind: spot`, `settlementKind: settled` and `computeChannel.Settled` identify full escrow as payable for the miner-share comparison. Other paths remain UNOBSERVABLE. Indexed burn is compared with zero. Validator and audit receipts remain UNOBSERVABLE because those fields are absent.

## Library and verification

```ts
import { rewardAt, supplyAt, paymentSplit, parseFlop, compare, recordedObservation } from "@flop-lab/economics";
const reward = rewardAt(63072000n);
const gross = supplyAt(378431999n).gross;
const split = paymentSplit(parseFlop("100"));
const report = compare(recordedObservation());
```

Run `pnpm --filter @flop-lab/economics check`. Tests cover recorded responses, genesis, each halving boundary, fractional subsidy, perpetual floor, quoted cumulative totals, dust, hostile input and empty observations. `FLOP_LIVE=1` enables the optional live read. Fixture capture commands are `pnpm exec tsx packages/economics/scripts/capture.ts` and `pnpm exec tsx packages/economics/scripts/capture-spec.ts`.

## What this does not verify

No runtime storage proof, block finality, deployed parameter agreement, total issuance, circulating supply, reward receipt, fee inclusion, audit payout or inference correctness is verified. Gross supply assumes the pinned genesis and unchanged schedule with the survival governor off. Historical settlement projections can differ from the current target. A DRIFT is not proof of a runtime defect. The bounded sample is not a network-wide fee history. Devnet can reset. No wallet or write transaction is used.
