# Settlement verifier page

`/verify` checks FLOP devnet settlement evidence with the same library as `flop-verify`. It starts with a dated recorded channel. Collect a public channel on demand or replay a JSON file entirely in the browser. Every result exposes its inputs and original observations. Download the exact bundle for offline replay.

## Run

From the repository root with Node 22:

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3330
```

Open `http://localhost:3330/verify`. Paste a channel id or load recent settlements. Choose **Verify a local bundle** to replay the downloaded `evidence.json`. Uploaded JSON is never sent to the server. Hash mismatches stop all other checks. Invalid JSON and oversized files preserve the previous result with an explicit error.

```sh
pnpm --filter @flop-lab/verifier build
node packages/verifier/dist/cli.js bundle evidence.json --json
```

The recorded example exits `3`, because missing proof is UNVERIFIABLE. Exit `1` means a failed check. Exit `0` applies only to the named checks that passed or did not apply.

## Collection limits

The server uses the shared MCP client through `EvidenceFetcher`. Reads occur only on request. Channel collection searches at most 100 settlement rows. Recent selection requests 6 rows. The server permits one collection at a time per process and coalesces requests for the same channel. Different concurrent requests receive HTTP 429 with `Retry-After: 30`.

Responses and failures are cached for 30 seconds with a maximum of 16 entries per process. Observation caching preserves original measurement times. The MCP transport waits at least 300 ms between requests, uses a 5-second timeout and retries 429 or 5xx once with backoff. These are configured limits rather than measured throughput claims. Serverless instances do not share a global rate limiter.

The initial recorded example comes from `packages/verifier/fixtures/channel-1.json`. It is labelled with its original capture time and source. A devnet reset can remove it from live services. Live collection failure keeps the previous result visible.

## Motion and access

Motion follows the reading order from question to input to results. Checklist rows reveal as they enter view. A scroll-linked rail shows reading position. Filters and expanded checks animate layout. Input mode uses a shared selection marker. Counts and bars derive only from the report and show the final count alongside the animated count. Route entrance is local to this page so the shared shell stays owned by its agent.

Reduced motion keeps instant states and readable values. All results use text as well as color. Controls retain native focus outlines. Raw evidence is rendered as text. Bundle URLs are never followed.

## What this does not verify

Matching hashes do not authenticate a bundle author. Arithmetic does not prove funds moved or inference was honest. Public views share an indexer. This page does not prove chain finality, historical prices, transcript inclusion, hardware appraisal or exact challenge eligibility. Read the package README for each check's limits.
