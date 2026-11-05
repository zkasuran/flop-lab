# TCLK workbench

Did the signed deal follow the protocol? This page replays the inspector's synthetic transcripts and compares their hash statements with a recorded public indexer page.

## Run

From the repository root:

```sh
pnpm --filter web check
pnpm --filter web build
pnpm --filter web exec next start --port 3470
```

Open `http://localhost:3470/tclk`. The page makes no browser API requests to FLOP. Pasted transcripts stay local. Cryptographic inspection loads on the first requested inspection. Initial results are server-rendered.

## Interaction and motion

Pick a rehearsal or paste normalized signed records. Each record is a keyboard button that selects its SPEC decision. Filter to violations without changing the fold. Copy the transcript or CLI command. Recorded chain rows retain source, query and capture time.

Motion follows reading order, message direction, the selected state and the measured accepted-record count. A scroll-linked line tracks the limits explanation. Reduced motion removes travel and changes states immediately. The shared tool header supplies the suite route marker.

## What this does not verify

The page does not authenticate the export's clock, order or completeness. It does not establish payment, finality, work quality, arbitration or adaptor presignatures. A recorded hash match is not a binding to the deal's amount, parties or deadlines. The checker response does not distinguish absence from unavailable RPC.
