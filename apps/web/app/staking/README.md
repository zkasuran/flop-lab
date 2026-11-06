# Stake builder

What stake does a capacity scenario require? `/staking` applies the package model to user input and compares it with dated public records.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3620
```

Open `http://localhost:3620/staking`. The page uses committed real recordings and makes no live requests. Source links and capture times remain visible in the source disclosure. Package documentation explains the exact formula, base-unit rounding and limits.

## Motion

Reading-order reveals introduce inputs before results. Transform-only bars show base and capacity exposure on the same scale. The exact final amount is readable immediately. Scenario changes, filters and disclosures use layout and presence animation. The scroll-linked reading line describes progress through the explanation. Shared tool markers connect the page to the suite grid. Every control has immediate focus and press feedback. Reduced motion keeps information with instant updates and no travel.

## What this does not verify

The page does not verify runtime constants, capacity leases, withdrawability, slashable balances or chain finality. Unknown offence rates remain unknown. A documented scenario is not a live staking quote. Network #75 cannot be reverified from these indexer fields.
