# Spendguard

Would my budget policy stop this request? Spendguard checks an agent's declared FLOP exposure before a spending callback runs. It reserves the budget in an append-only ledger and shows the rule behind each decision. Unresolved operations keep their reservation.

## Quick start

From the repository root with Node 22 and pnpm. This evaluates a scripted request without spending:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/spendguard build
node packages/spendguard/dist/cli.js evaluate packages/spendguard/examples/policy.json packages/spendguard/examples/request.json --dry-run
```

## Run

From the repository root with Node 22 and pnpm:

```sh
pnpm install
pnpm --filter @flop-lab/spendguard run check
pnpm --filter @flop-lab/spendguard run build
node packages/spendguard/dist/cli.js evaluate packages/spendguard/examples/policy.json packages/spendguard/examples/request.json --dry-run
```

The example is a scripted scenario. Limits, miner labels and prices are chosen inputs. They are not network observations. The CLI signs nothing and reports its file sources and evaluation time. Exit codes: `0` for allow or successful verification, `2` for deny and `1` for invalid input or integrity errors.

Create a ledger in a directory you control:

```sh
node packages/spendguard/dist/cli.js init ./spend.jsonl
node packages/spendguard/dist/cli.js verify ./spend.jsonl
node packages/spendguard/dist/cli.js evaluate packages/spendguard/examples/policy.json packages/spendguard/examples/request.json --ledger ./spend.jsonl --dry-run
```

`init` refuses existing files. Retain the printed head in a separate trusted location. Verify against it with `verify ./spend.jsonl EXPECTED_HEAD`. CLI simulation does not authorize a later library spend. The CLI accepts JSON or strict policy YAML. The importable API also provides typed SDK session and wallet guards.

## Policy

See [the example](examples/policy.json) and [JSON Schema](policy.schema.json). Quote all FLOP values. Unknown keys fail closed. Decimal strings convert to exact `bigint` amounts. Exponents, negatives and excess fractional precision are refused.

[The YAML example](examples/policy.yaml) supports two-space mappings, block lists, plain names, quoted strings and JSON inline arrays or maps. Anchors, tags, multiline scalars, tabs and inline comments are refused. Full-line comments are allowed. Use `parsePolicyText` for the same parser in the browser. This is a deliberate policy subset, not a general YAML parser.

- `budgets.task`: lifetime net charge for a task ID.
- `budgets.hour` and `budgets.day`: rolling windows `(now - window, now]`.
- `budgets.total`: lifetime net charge for the ledger.
- `modelCaps` and `minerCaps`: optional lifetime caps by exact name.
- `maxEscrowPerSession`: maximum amount at risk for one operation.
- `maxPricePerGflop`: maximum quoted decimal FLOP per GFLOP.
- `allowModels` and `allowMiners`: exact allowlists. Empty lists deny everything.
- `denyMiners`: takes precedence over the miner allowlist.
- `requireDryRun`: requires a matching library preflight before execution.
- `cooldown`: minimum milliseconds between admitted operations across tasks.

Every unresolved reservation counts against rolling windows even after it ages out. A denied request changes no reservation. The audit log records the denial. Evaluation is independent of ledger array order. Admission order can affect which competing request receives a limited budget. Use one ledger for the whole budget boundary. Keep policy files and task naming under trusted control.

## Import

```ts
import { evaluate, parsePolicy } from "@flop-lab/spendguard/policy";

const policy = parsePolicy(parsedJson);
const decision = evaluate(policy, reservations, request);
console.log(decision.decision, decision.fired);
```

The `/policy` export is browser-safe. The main export includes the Node ledger and callback guard.

```ts
import { FileLedger, guardedSpend, webhook } from "@flop-lab/spendguard";

const ledger = new FileLedger("./spend.jsonl"); // initialize once
const guard = { policy, ledger, notify: webhook(alertUrl) };
const operation = {
  binding: { destination, amount: request.amount },
  execute: trustedBoundedSpend,
  channelId: () => null,
};
await guardedSpend(guard, request, operation, { dryRun: true });
const result = await guardedSpend(guard, request, operation, { dryRun: false });
```

The callback is trusted application code. Its maximum spend must equal `request.amount`. Dry-run authorization binds the policy, task, request ID and operation data. It expires after 120 seconds and cannot be reused after admission. Live calls re-evaluate budgets under the ledger lock. A returned callback value does not establish finality and does not release the reservation.

## SDK integration

Spendguard uses an explicitly supplied SDK port. Import your application's installed `@flop-labs/sdk@0.4.0` and pass its functions directly. Generic types preserve the SDK's concrete API, signer, estimate and result types. Spendguard itself has no runtime dependency on the SDK.

```ts
import { runDirectSession, computeChannel } from "@flop-labs/sdk";
import { guardedSession, reconcileChannel, sdkFinalityPort } from "@flop-lab/spendguard";

const sdkPort = { runDirectSession, estimateSession: computeChannel.estimateSession };
const permit = {
  network: "devnet" as const,
  throwaway: true as const,
  genesisHash: verifiedDevnetGenesis,
  maxFlop: "0.01",
};
// plan.session holds api, signer, miner, model, prompt and maxTokens.
// plan.estimate holds the SDK's architecture, token bound, price and calibration inputs.
// plan.source and plan.measuredAt identify those supplied inputs.
await guardedSession(guard, request, plan, permit, { dryRun: true }, sdkPort);
const result = await guardedSession(guard, request, plan, permit, { dryRun: false }, sdkPort);
// Once the outcome block is known, read finalized state instead of trusting result:
await reconcileChannel(guard, request.id, outcomeBlockHash, rpcSource, sdkFinalityPort(api, channelId));
```

The guard uses `estimateSession`, admits exactly one channel and checks that generated tokens cover `maxTokens`. The full estimated escrow must fit `request.amount`, the permit's hard ceiling and every policy limit. It passes that exact escrow as `maxFlop`. It never increases a requested ceiling to make an estimate fit. The dry run invokes the estimator and policy pipeline but does not call `runDirectSession`.

SDK return values and error messages never release a reservation. Reconciliation requires a matching canonical finalized block, `Closed` channel state and a matching full-refund event. A finalized settlement ends the pending hold but keeps the full escrow charged. Unknown and partial outcomes remain reserved. RPC reads are fresh. Forced settlement claims are not final settlements.

`guardedWalletMove` wraps explicit `fund`, `transfer` and `withdraw` calls. Supply the SDK object as its last argument. The request model is `wallet:<kind>`, miner is the destination and price is `"0"`. Wallet outcomes retain their reservation because wallet finality reconciliation is not implemented. Provisioning wallets, granting session keys and arbitrary nested `executeViaSession` calls are outside this wrapper.

Read [NOTES.md](NOTES.md) before connecting a signer. Only use a newly generated devnet wallet with a faucet-verified genesis hash. `throwaway: true` is the owner's assertion, not proof of wallet origin.

## Ledger and alerts

Each JSONL record hashes its sequence, previous hash and canonical event. A separate `.head` anchor detects tail truncation. Writes hold an exclusive local filesystem lock and sync the log before replacing the head. Competing processes evaluate and reserve under the same lock. Spending callbacks run after the lock is released.

An interrupted append or abandoned `.lock` fails closed. Inspect the owning process and compare a trusted backup or external head before operator recovery. Do not automatically delete lock or head files. Local regular files are supported. Network filesystems and hostile changes by the same OS user are not a supported isolation boundary.

Webhook JSON includes `type`, `measuredAt`, `source` and `details`. Types are `deny`, `budget80` and `tampering`. Budget alerts fire when an admitted request crosses the 80 percent threshold. Delivery failure is returned in `warnings` and never repeats a spend. HTTPS requests time out and retry only 429 or 5xx with bounded backoff. Prompts and callback results are not stored in the ledger.

## Evidence and performance

```sh
pnpm --filter @flop-lab/spendguard run mutation
pnpm --filter @flop-lab/spendguard run measure
```

The mutation command disables each policy rule separately, requires a failing test and restores the source in `finally`. Do not interrupt it forcibly. The measurement command reports cold CLI duration and observed socket connections. It signs nothing.

[NOTES.md](NOTES.md) records SDK research and the chain-reconciliation rules. The raw public standing-offer observation in `fixtures/offers.json` includes source and capture time. Its empty response is not proof that no direct miner endpoint exists. `fixtures/sdk-estimate.json` records actual SDK output for clearly labelled synthetic inputs. The fixed-profile fake refuses other inputs. The shipped SDK declarations were also type-checked against the generic ports. This CLI is offline. No chain outcome is cached. Library preflight authorization has an explicit 120-second TTL.

## What this does not verify

- This is an application guard. A program that has the signer, can edit the policy or supplies an unbounded callback can bypass it.
- The guard budgets declared exposure. Transaction fees, provisioning costs, other wallets and unwrapped calls are outside those budgets.
- Quote authenticity, miner availability and the actual amount moved by an arbitrary callback are not verified.
- A hash chain alone does not detect rewriting both the log and its local anchor. Store an external trusted head to detect that rewrite. Audit metadata is not encrypted.
- The low-level ledger accepts trusted audit events. It is not a finality oracle. The SDK reconciliation adapter trusts the connected RPC node's finalized canonical view. It is not a consensus light client.
- Architecture, token counts, calibration and price provenance are supplied by the integrating application. The guard does not prove those inputs came from a signed miner quote.
- Partial refunds, fraud refunds and wallet finality reconciliation are unsupported. Their reservations stay charged. Successful sessions stay charged until explicit reconciliation.
- Deployed wallet-pallet limits, session-key restrictions, circuit-breaker behavior, miner proofs and hardware attestation were not verified. No wallet was created or funded.
- No real devnet inference round trip was completed. The read-only MCP and a model catalog do not provide the reachable opted-in miner endpoint required by the SDK.
