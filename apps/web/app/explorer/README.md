# Explorer page

Which public query explains this value? `/explorer` starts with a real recorded compute channel. Search the live devnet or switch between recorded block, transaction, account, channel and HTLC examples.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3440
```

Open `http://localhost:3440/explorer`. The page uses `packages/explorer` and the shared MCP client.
The CLI command under a result runs from a built workspace. Recorded example buttons do not call MCP.

## Evidence

Every value group shows its tool and receipt time. Hover a field for its source or open its source and query disclosure.
The raw tool response stays available. Derived values name their formula and input evidence.
The saved PoUI query shows an empty response with its capture time.
The verifier link opens `/verify`. Copy the channel ID and paste it into that page to collect verifier evidence.

Live searches use a shared server-side explorer. Its success cache lasts 15 seconds and its partial-result cache lasts 5 seconds.
An HTTP-only browser cookie allows 3 live searches per minute. A separate server-instance budget allows 12 total per minute.
Resetting cookies does not bypass that instance budget. These limits reset when an instance restarts and do not coordinate across instances.
Each client retries transient MCP errors once with backoff. Invalid search inputs use no budget.
Failed requests keep the previous result visible with an error. Cached observations keep their original receipt times.

Reading reveals follow the question, search and result. The vertical line follows reading progress.
Result cards and disclosures use layout animation. Escrow bars use measured amounts.
Controls provide immediate press, hover and focus feedback. Shared route motion comes from the shell.
Reduced motion keeps final values and immediate state changes.

## What this does not verify

Recorded data is not current chain state. Live indexer data is not a consensus or inference proof.
Fees and transaction events are not exposed by the observed schema. Block transactions are a bounded recent window.
Account pages are not complete histories. Empty lists are observations, not proof of no activity.
Balance sources can differ. A missing frozen balance is not zero. HTLC checker unavailability is not nonexistence.
Arithmetic checks establish only the displayed integer equality. Browser budgets are load controls, not visitor identity checks.
