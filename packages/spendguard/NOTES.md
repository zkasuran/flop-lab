# Spendguard SDK research

Inspected on 2026-11-05. Package: `@flop-labs/sdk@0.4.0`.

This note records the SDK findings and integration design. The package exports policy, ledger and SDK adapters. The application injects its installed SDK functions. Generic ports preserve their concrete types without a package runtime dependency. Compatibility was checked against the shipped SDK declarations.

Registry tarball: <https://registry.npmjs.org/@flop-labs/sdk/-/sdk-0.4.0.tgz>.
SHA256: `bfccb19b27899ec1c76ccb32c2a2c62af3763e09b6e597f8a36aad25705b9b0f`.
The tarball was unpacked in the agent scratch directory. These findings come from its README, JavaScript implementation and TypeScript declarations.

## Read the implementation before using the README

The README wallet examples take a client and decimal JavaScript numbers. The shipped functions take a polkadot API, signer and raw `bigint` amounts. Spendguard follows the shipped declarations.

| Shipped API | Fund movement or authority change |
| --- | --- |
| `createAgentWallet(api, signer, {agent, perTxLimit, dailyCap, allowedDestinations})` | Creates wallet guardrails. Transaction fees apply. |
| `fundAgentWallet(api, signer, agent, amount)` | Moves the owner's funds into the agent wallet. |
| `agentTransfer(api, signer, destination, amount)` | Transfers wallet funds through the wallet pallet. |
| `ownerWithdraw(api, signer, agent, amount)` | Moves wallet funds back to the owner. |
| `createSession(api, signer, {delegate, spendingCap, durationBlocks, allowedPallets})` | Grants delegated authority. Defaults per-transaction and daily limits to `spendingCap`. |
| `createCalibratedSession(api, signer, params)` | Explicit spending, per-transaction and daily caps. |
| `executeViaSession(api, signer, owner, call, spendAmount)` | Executes a supplied call through the session pallet using a queried nonce. The nested call controls actual movement. |
| `runDirectSession(options)` | Opens escrow, serves one turn and settles or attempts recovery. It escrows `options.maxFlop`. |
| `computeChannel.estimateSession(input)` | Pure calculation. No signing, RPC or funds. |

Sources: `dist/agent-wallet.js` lines 87-100, 109-174 and 345-374; `dist/agent-wallet.d.ts`; `dist/compute-channel/direct-session.js`; `dist/compute-channel/session-estimate.js`.

## Chain-enforced and application-only boundaries

The SDK sends wallet per-transaction, daily and destination limits to the AgentWallet pallet. It sends spending, per-transaction, daily, expiry and pallet restrictions to the session-key pallet. Those are chain-configured limits for those dispatch paths. Their enforcement on a deployed runtime is not established by an SDK constant or a client pre-check. This work did not execute those extrinsics or audit the runtime implementation.

`checkSessionLimits` reads session storage. Its circuit-breaker result is populated with zeros in this release. Spendguard does not treat that object as measured breaker state. `CALIBRATED_LIMITS` and `PROPOSED_LIMITS` are SDK constants, not queried network parameters.

Task budgets, rolling hours, model caps, miner caps, price limits, dry-run requirements and cooldowns are application rules here. They do not configure a chain pallet. The signer must live behind the guard. A program holding the signer can bypass this library. A wallet funded only up to its intended exposure is a separate on-chain boundary.

The direct-session runtime creates `FlopChainSubmitter(api, signer, true)`. It does not wrap calls with `executeViaSession`. Creating an agent wallet or session key does not automatically put `runDirectSession` under their pallet restrictions. `SessionChainSubmitter` is a separate SDK path and only permits a fixed list of nested compute-channel methods.

## Escrow is the amount at risk

The estimator calculates `G_n` from the supplied architecture and token profile. It raises per-channel escrow to the largest of catalog cost, standing-offer minimum, the base-turn tariff plus work and a nonzero floor. Cooperative spot settlement pays the reserved escrow. Transaction fees are additional.

Spendguard requires one estimated channel and one turn. Generated tokens must cover `maxTokens`. It admits the exact estimated escrow against every policy cap, the requested amount and the permit's hard ceiling. It passes that amount as `maxFlop`. It never offers the whole remaining budget to the SDK. Architecture, context-token counts, price, calibration and their provenance remain trusted application inputs. A low estimate can cause failure. It cannot raise the guarded escrow cap.

## Finality and refunds

`agent-wallet.js` resolves `submitTx` at `isInBlock` or `isFinalized`. An included transaction is not a finalized refund.

`runDirectSession` returns either a cooperative settlement or a posted forced-settlement claim. `SettlementPosted` has a challenge end and is not final settlement. `DirectSessionError` carries a channel ID. Its message can describe a refund without providing the evidence Spendguard requires.

Spendguard retains every reservation after SDK return or error. Explicit reconciliation reads a canonical block at or below the finalized head. It reads the matching channel from that block and requires `Closed` state plus a matching `ForceOpenExpired`, `TimedOutRefunded` or `Settled` event. Refund events must return the complete reserved amount. A `Closed` state alone does not prove a refund. Unknown, partial and missing outcomes retain their charge.

Sources: `dist/compute-channel/direct-session.js` lines 76-94 and 170-205; `dist/compute-channel/chain.js` lines 298-369; `dist/compute-channel/direct-session-chain.js` lines 35-39 and 151-156; `dist/compute-channel/flop-submitter.js` lines 19-49.

## Public test path

The named-miner guide requires a reachable miner endpoint. The hosted MCP is read-only. A gateway model listing does not establish a reachable direct worker. The recorded standing-offer response is in `fixtures/offers.json`. It includes its source and capture time. No real session or faucet transaction was performed. No wallet was created.

References:

- <https://docs.flop.network/docs/agent-accounts-and-spend-control> (marked Draft whitepaper when inspected).
- <https://docs.flop.network/docs/send-to-specific-miner>.
- Registry tarball and shipped files listed above.
