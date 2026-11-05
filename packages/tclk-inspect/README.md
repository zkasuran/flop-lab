# Deal inspector

Did this agent-to-agent deal follow the protocol? Inspect a signed TCLK transcript and see the first rejected record, the state before and after it and the SPEC section behind the decision. Inspecting a transcript does not move funds.

## Quick start

Run from the repository root with Node 22 after `pnpm install`:

```sh
pnpm --filter @flop-lab/tclk-inspect build
node packages/tclk-inspect/dist/cli.js simulate happy > /tmp/opencode/tclk-deal.json
node packages/tclk-inspect/dist/cli.js inspect /tmp/opencode/tclk-deal.json --offline
```

The temporary directory `/tmp/opencode` must exist. The example is a synthetic signed rehearsal. Its public test keys are not wallets and its escrow reference names no payment.

After the suite build, `node packages/cli/dist/cli.js tclk --help` runs the same binary through the suite CLI. A locally installed `flop` binary accepts the same `tclk` subcommand.

## Inspect a transcript

```sh
node packages/tclk-inspect/dist/cli.js inspect transcript.json --json
node packages/tclk-inspect/dist/cli.js simulate wrong-preimage
```

Input is an array of normalized records or an object with a `records` array. Each record contains `room`, `seq`, `timestampMs`, `sender`, `nonce`, `signature` and `line`. `line` is the exact canonical `tclk1 ` message. `nonce` must retain its original decimal digits as text. `signature` is unpadded base64url. Detached frame objects and unsigned messages are not commitments.

The inspector verifies the Ed25519 signature over `room|nonce|line`, sender binding, frame schema, canonical bytes, ids, room binding, roles, rail membership, deadlines and hash or point witnesses. It processes records in supplied order. Rejected records leave state unchanged. The report retains every decision and identifies the first violation using a zero-based index. Human CLI output uses record numbers starting at one.

Exit codes: `0` for conformant or empty input, `1` for a violation and `2` for a file, JSON or command error. Empty input reports `no-data`. Input is capped at 500 records and 2000000 bytes.

### Protocol decisions

The pinned reference is [`7d402db451ad952e3695e8ce9a8fcac99893950b`](https://github.com/flop-labs/tclk/tree/7d402db451ad952e3695e8ce9a8fcac99893950b). Every step cites its [SPEC](https://github.com/flop-labs/tclk/blob/7d402db451ad952e3695e8ce9a8fcac99893950b/SPEC.md) section.

- A reveal after `claimByMs` but before `refundAfterMs` is conformant with a late-reveal warning. A reveal at `refundAfterMs` is rejected.
- Time passing alone causes no transition. A timed-out locked deal stays `locked` until a conformant refund record arrives.
- Mailbox accepts are rejected under the room-binding requirement. SPEC 2 also describes a mailbox alternative. [Issue 198](https://github.com/flop-labs/tclk/issues/198) tracks that conflict.
- A proposed cancel must name `offer.id`. No contract id exists yet. This is a conservative inspector rule, not a settled protocol rule. [Issue 5](https://github.com/flop-labs/tclk/issues/5) tracks the ambiguity.
- Repeated frames are rejected per SPEC 4. The pinned upstream fold accepts repeated heartbeats and receipts. It also accepts noncanonical frame JSON, which this inspector rejects under SPEC 3.
- The upstream JSON Schema is compiled in AJV strict mode with its rail annotation keywords registered. Runtime checks add safe integer deadlines, point validity and ids. [Issue 199](https://github.com/flop-labs/tclk/issues/199) documents the unconfigured AJV failure.
- No arbiter field is invented. [Issue 223](https://github.com/flop-labs/tclk/issues/223) tracks the mismatch between SPEC 8 and the offer schema.

## Chain observations

By default, `inspect` queries `flop_check_htlc` and the first 100 indexer `htlcs` through the shared MCP client when an accepted hash statement exists. Use `--offline` to skip these requests. A point statement makes no HTLC request.

Each response retains raw text, source and receipt time. The reader spaces requests by 250 ms and retries once with backoff on network failures, 429 or 5xx. A reader instance caches a hash result for 60 seconds, including failures. A cache hit makes no request. The CLI starts a new reader per invocation.

The recorded checker response is `HTLC not found or RPC unavailable.` It is ambiguous even for a hash present in the recorded indexer page. The inspector reports that ambiguity. It does not convert it into proof of absence. Unrecognized checker responses are retained as raw evidence and reported as unavailable.

A hash match is an observation only. No match means no match in the sampled page. The scan is bounded and does not claim complete chain coverage.

## Library

```ts
import { inspectTranscript, simulate, createChainReader } from "@flop-lab/tclk-inspect";

const report = inspectTranscript(simulate("happy"), "local rehearsal");
const chain = await createChainReader()(report.state);
```

The pure inspector also runs in the browser. The chain reader uses only the shared `@flop-lab/mcp` transport.

## Evidence and checks

`fixtures/schema.json` records the raw upstream schema with its commit, URL and fetch time. `fixtures/htlcs.json`, `check-absent.json` and `check-observed.json` record public MCP responses. `fixtures/introspection.json` records query arguments.

`fixtures/simulations.json` is synthetic. Its signed records cover hash and point claims, refund, timeout, both cancel paths, both offer roles, heartbeat, receipt and hostile variants. Each case includes the pinned upstream `foldTranscript` result. Tests compare every result and assert the documented disagreements.

```sh
pnpm --filter @flop-lab/tclk-inspect check
pnpm --filter @flop-lab/tclk-inspect record
pnpm --filter @flop-lab/tclk-inspect exec tsx scripts/simulations.ts /path/to/pinned-tclk/dist/index.js
```

The last command needs a clone of the pinned commit installed and built with its own pnpm workspace. Recording is opt-in. Normal checks run offline.

## What this does not verify

The export supplies time, order and completeness. Signatures do not authenticate those facts. Missing records can change the apparent outcome. This tool does not fetch room history or attest the venue clock.

Transcript state is not settlement state. The inspector does not bind an observed HTLC to the agreed amount, parties, asset, reference or deadline. It does not verify finality, work delivery, model quality, arbitration votes, presignature correctness or payment. It validates the PTLC witness relation but not an adaptor signature's rail-specific message. Rehearsal rails establish no external value. The protocol and its reference crypto are not an audit of a live deal.
