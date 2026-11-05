# Spendguard

Exact budget checks before an agent spends FLOP. A durable reservation is written before a trusted spending callback runs. Every decision includes a rule trace. Failed operations retain their reservation.

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

`init` refuses existing files. Retain the printed head in a separate trusted location. Verify against it with `verify ./spend.jsonl EXPECTED_HEAD`. CLI simulation does not authorize a later library spend. This milestone accepts JSON policies and provides a trusted-callback guard. SDK-specific session integration follows separately.

## Policy

See [the example](examples/policy.json) and [JSON Schema](policy.schema.json). Quote all FLOP values. Unknown keys fail closed. Decimal strings convert to exact `bigint` amounts. Exponents, negatives and excess fractional precision are refused.

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

[NOTES.md](NOTES.md) records SDK research and the design for chain reconciliation. The raw public standing-offer observation in `fixtures/offers.json` includes source and capture time. Its empty response is not proof that no direct miner endpoint exists. This CLI is offline. No chain outcome is cached. Library preflight authorization has an explicit 120-second TTL.

## What this does not verify

- This is an application guard. A program that has the signer, can edit the policy or supplies an unbounded callback can bypass it.
- The guard budgets declared exposure. Transaction fees, provisioning costs, other wallets and unwrapped calls are outside those budgets.
- Quote authenticity, miner availability and the actual amount moved by an arbitrary callback are not verified.
- A hash chain alone does not detect rewriting both the log and its local anchor. Store an external trusted head to detect that rewrite. Audit metadata is not encrypted.
- The low-level ledger accepts trusted audit events. It is not a finality oracle. This milestone has no automatic refund-release path.
- Deployed wallet-pallet limits, session-key restrictions, circuit-breaker behavior, miner proofs and hardware attestation were not verified. No wallet was created or funded.
- No real devnet inference round trip was completed. The read-only MCP and a model catalog do not provide the reachable opted-in miner endpoint required by the SDK.
