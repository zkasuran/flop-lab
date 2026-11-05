# Spend guard policy playground

An interactive browser view of `packages/spendguard/src/policy.ts`. It runs the real `parsePolicyText` and `evaluate` functions. It imports no Node ledger or SDK code.

## Run

From the repository root with Node 22 and pnpm:

```sh
pnpm install
pnpm --filter web exec next dev --port 3340
```

Open http://localhost:3340/spendguard. Edit the YAML, evaluate requests and select a decision to read every rule. Invalid policies pause evaluation and clear derived results. Restoring the policy resets the replay. Policy edits recalculate the processed prefix from an empty ledger.

```sh
pnpm --filter @flop-lab/spendguard check
pnpm --filter web check
pnpm --filter web build
pnpm --filter web exec next start --port 3340
```

Stop the development server before starting production. The page includes a copyable CLI command for the package's bundled example. Copy YAML to use your edited policy locally.

## Data and arithmetic

The server validates `apps/web/tests/fixtures/models.json` before extracting the first model and miner identity. The page shows the recording's source, capture time, nominal-source label and expiry. A malformed or empty recording gives a no-data state. It never creates a fallback identity.

The recording is a build-time, last-known snapshot. It has no freshness TTL and is never labelled live. No network request is needed for policy edits or replay. Gateway token pricing is not converted into GFLOP pricing. Limits, escrows, quoted GFLOP prices and request offsets are chosen scenario inputs.

Every allow reserves the full declared amount in an in-memory ledger. Every denial leaves that ledger unchanged. Reservations stay pending. Task usage follows the latest processed request. All arithmetic uses the package's decimal-string to `bigint` conversion. Only normalized bar transforms use floating point. Text always shows exact final values without waiting for animation.

## Motion and accessibility

Motion reveals sections in reading order on entry from the tool grid. The shared shell's `RouteSurface` animates route arrivals. The return `MotionLink` keeps that shell mounted. A scroll-linked rail tracks progress through policy, budgets and trace. Budget bars transform to the calculated ratio. Failed budget rules turn the corresponding bar and boundary red. Changed amounts enter with their exact final text. Filtering repositions decision rows with layout animation. Source details and trace selection use `AnimatePresence`.

Controls respond immediately with hover, press and focus states. Reduced motion removes travel and uses instant updates. The progress rail stays fully visible. There are no ambient loops. Controls use native buttons, labelled inputs, pressed states and live validation messages. Budget meters include exact FLOP text for assistive technology.

The replay and catalogue boundary tests live in `packages/spendguard/test/site.test.ts`. The existing each-rule mutation suite protects the same evaluator used by this page.

## What this does not verify

This page does not sign transactions, grant preflight authorization, enforce chain limits or check miner availability. Recorded identities do not prove quote authenticity. All requests are scripted.

The browser ledger does not exercise the package's file locking, hash chain, webhook delivery or finalized refund reconciliation. It does not persist edits or balances. A program with access to a signer can bypass an application guard. See the package README for its full trust boundary.
