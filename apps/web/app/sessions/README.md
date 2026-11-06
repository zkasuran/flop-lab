# Session lifecycle page

Where is each channel in the recorded lifecycle? The page groups real channels by evidence-backed state. Select a channel, switch between its reported opening and latest state and inspect the exact fields in a drawer.

## Run

From the repository root with Node 22 and pnpm. Open http://localhost:3640/sessions.

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3640
```

The page uses the package's raw recorded responses. It does not poll public services. The drawer loads its channel from a same-origin recorded-data route. The report download contains classified evidence. Raw responses remain in `packages/sessions/test/fixtures/live`.

The marker moves only between the selected channel's `openedBlock` and its latest reported state. This is an event reconstruction, not a claim that an earlier complete snapshot was recorded. Intermediate states are not inferred. Counts stay fixed while tracing. Filtering and paging affect visible rows only.

The historical table uses digest-checked bundled recorder snapshots. Those contain settlement samples, not complete channel histories. Their zero counts mean no such state in that sample. They do not mean the whole network had no channels in that state.

Motion follows reading order, traces the selected channel, animates observed bars and preserves filter and drawer context. The reading line tracks scroll position. Reduced motion keeps the final values and instant state changes. The shared header supplies the grid-to-page marker transition.

Copy a channel ID from the drawer before following the verifier or challenger link. Those tools do not accept a channel prefill through their page URL, so the links do not claim to preload it.

## What this does not verify

The page does not verify inference, hardware, chain finality, payout amounts, challenge eligibility or off-chain usage. The diagram describes documented transitions. It does not establish that every branch exists in this devnet recording. Recorder samples do not prove a network trend. Local production-browser measurements do not establish deployed performance.
