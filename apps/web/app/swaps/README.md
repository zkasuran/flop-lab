# Swap planner page

Is this swap's timing ready to start? `/swaps` checks a declared scenario against pinned HTLC rules and shows dated public observations.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3660
```

Open `http://localhost:3660/swaps`. The initial scenario is synthetic. The order list, indexed HTLC page and checker response are recorded real data from `packages/swaps/fixtures`. Source and receipt times are shown with each count. The page makes no public network requests.

The timeline uses declared durations. Its green region means the duration reaches the calculated timing boundary. It does not override the finality gate. Scroll progress marks the reading position in the explanation. Status changes, row filters, disclosures and timeline bars use Motion. Reduced motion keeps values and changes state instantly.

Local generation uses Web Crypto in browser memory. Only the hash lock enters the copyable CLI lookup command. The preimage is never sent to a service or saved in browser storage. The CLI performs the public check when the user runs that command.

## What this does not verify

This page does not verify live runtime parameters, finality, counter-chain inclusion, chain-pair qualification, refund ordering or completion. Indexed HTLCs are not proof of paired swaps. Empty open orders do not mean no historical swaps exist. A checker response that combines missing HTLC and unavailable RPC remains UNKNOWN.
