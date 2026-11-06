# Metering page

How much reference work does a declared workload contain and when does its miner cap expire? This page combines exact local calculators with dated public miner fields. It shows missing lifecycle anchors explicitly.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3630
```

Open `http://localhost:3630/metering`. The page uses recorded real data and makes no public service calls from the browser. `/metering/recording` downloads the raw miner and stats observations with receipt times and source URLs.

## Interaction and motion

Reference-work inputs floor once and check the selected destination width. Reward decay uses a capped period-relative exponent. Lease inputs are explicitly declared scenarios. Search and calibration filters select the miner whose incomplete observed lifecycle is shown.

Reading-order reveals, measured-value entrances, exact-value bars, miner selection transitions, filter layout changes and disclosure motion explain changes. The model guide uses `useScroll` and `useTransform` to fill a reading rail. The shared tool header supplies the grid-to-page marker. Controls act immediately. Reduced motion removes travel and makes bar changes instant.

## What this does not verify

No execution meter, current calibration acceptance block, runtime storage proof, credential, attestation, stake or inference execution is verified. An indexed Active label does not prove a live lease. Network #76 remains unobservable from this recording. The local calculator does not authorize serving or submit a transaction.
