# Spend guard policy playground

Will a shared policy hold against recorded exposure? This page runs Spendguard's policy linter and replays a dated settlement page or SDK cost estimate. It also retains the scripted YAML playground. It imports no Node ledger or SDK runtime code.

## Run

From the repository root with Node 22 and pnpm:

```sh
pnpm install
pnpm --filter web exec next dev --port 3580
```

Open http://localhost:3580/spendguard. Edit the replay policy to see lint findings and fixes. Process one row or the full recording, filter decisions and open a rule trace. Choose the SDK estimate and load its chosen identity bindings to replay it separately. Invalid policies pause evaluation and clear derived results. Policy edits recalculate the processed prefix from an empty ledger.

```sh
pnpm --filter @flop-lab/spendguard check
pnpm --filter web check
pnpm --filter web build
pnpm --filter web exec next start --port 3580
```

Stop the development server before starting production. The page includes a copyable CLI command for the package's bundled example. Copy YAML to use your edited policy locally.

## Data and arithmetic

The server validates `packages/spendguard/fixtures/settlements.json` and `sdk-estimate.json` before passing browser-safe tapes to the page. The settlement page is partial. The UI shows source, capture time and replay assumptions. Settlement time is a proxy for admission time. Model hashes are exact identities. One synthetic task is assigned per recorded agent and preflight is assumed. Full escrow stays pending. SDK identities and estimator inputs are chosen scenarios.

The linter uses the recorded SDK `CALIBRATED_LIMITS` excerpt in `fixtures/documented-caps.json`. It does not query runtime limits. Every finding has a fix. A clean lint result does not establish chain enforcement. Sample policy limits are chosen inputs, not recommendations.

The server validates `apps/web/tests/fixtures/models.json` before extracting the first model and miner identity. The page shows the recording's source, capture time, nominal-source label and expiry. A malformed or empty recording gives a no-data state. It never creates a fallback identity.

The recording is a build-time, last-known snapshot. It has no freshness TTL and is never labelled live. No network request is needed for policy edits or replay. Gateway token pricing is not converted into GFLOP pricing. Limits, escrows, quoted GFLOP prices and request offsets are chosen scenario inputs.

Every allow reserves the full declared amount in an in-memory ledger. Every denial leaves that ledger unchanged. Reservations stay pending. Task usage follows the latest processed request. All arithmetic uses the package's decimal-string to `bigint` conversion. Only normalized bar transforms use floating point. Text always shows exact final values without waiting for animation.

## Motion and accessibility

Motion reveals sections in reading order on entry from the tool index. The shared shell's `RouteSurface` animates route changes. The return `MotionLink` keeps that shell mounted. A scroll-linked rail tracks progress through policy, budgets and trace. Budget bars transform to the calculated ratio. Failed budget rules turn the corresponding bar and boundary red. Changed amounts enter with their exact final text. Filtering repositions decision rows with layout animation. Source details and trace selection use `AnimatePresence`.

Controls respond immediately with hover, press and focus states. Reduced motion removes travel and uses instant updates. The progress rail stays fully visible. The page content has no ambient loops. Controls use native buttons, labelled inputs, pressed states and live validation messages. Budget meters include exact FLOP text for assistive technology.

The replay and catalogue boundary tests live in `packages/spendguard/test/site.test.ts`. The existing each-rule mutation suite protects the same evaluator used by this page.

## What this does not verify

This page does not sign transactions, grant preflight authorization, enforce chain limits or check miner availability. Recorded identities do not prove quote authenticity. Replay does not reconstruct original admission, task assignment or preflight state. It does not prove finalized refunds or use missing settlement history.

The browser ledger does not exercise the package's file locking, hash chain, webhook delivery or finalized refund reconciliation. It does not persist edits or balances. A program with access to a signer can bypass an application guard. See the package README for its full trust boundary.
