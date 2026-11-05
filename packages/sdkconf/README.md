# SDK conformance

Do the FLOP SDKs behave as documented? This tool runs pinned published packages against scripted services. It records each request, checks the documented expectation and shows the result at `/sdk`.

## Quick start

From a clone of flop-lab with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/sdkconf build
node packages/sdkconf/dist/cli.js run --sdk client
```

The gateway client checks pass on the pinned release. Run the full suite to see confirmed upstream failures:

```sh
pnpm --filter @flop-lab/sdkconf start run
pnpm --filter @flop-lab/sdkconf start run --json
pnpm --filter @flop-lab/sdkconf start run --scenario sdk-x402-class
```

After building the suite, use `node packages/cli/dist/cli.js sdk run`. This is the `flop sdk` subcommand. The package binary is `flop-sdkconf`.

Exit codes: `0` means all selected checks passed. `1` means a confirmed failure. `2` means a usage or runner error. `3` means coverage was skipped with no confirmed failure. A known upstream failure is still a failure.

## What runs

The package pins `@flop-labs/sdk` 0.4.0, `@flop-labs/client` 0.2.1 and `@flop-labs/cli` 0.4.0 as development dependencies. Builds keep those artifacts external. Each run checks the installed versions.

An isolated worker replaces Fetch with an in-process script. It accepts only fixture origins and never delegates to the network. The caller's Fetch is unchanged. Scenarios cover HTTP refusals, Retry-After, transport loss, timeouts, slow bodies, malformed JSON, replay keys, payment handshake counts and worker reporting. The CLI subprocesses run only `--version` and `--help` with an empty home path.

Every check includes a reference URL, line range and quote. The report distinguishes explicit documentation from type contracts and issue regressions. A PASS covers only that check. A FAIL requires two failed attempts with fresh scenario instances. Mixed results and unavailable coverage are SKIPPED. The runner has a fixed deadline and does not retry public services.

`fixtures/report.json` is an actual offline run. Its `measuredAt`, `runtime` and `durationMs` identify when and how it was measured. Request times are mock timings. They do not measure devnet latency. Known regressions link to network issues [#71](https://github.com/flop-labs/network/issues/71), [#72](https://github.com/flop-labs/network/issues/72), [#78](https://github.com/flop-labs/network/issues/78), [#82](https://github.com/flop-labs/network/issues/82) and [#89](https://github.com/flop-labs/network/issues/89).

## Fixtures and freshness

`fixtures/models.json` and `fixtures/mcp.json` contain raw public responses, source URLs and capture times. The model scenario uses the real feed. Hostile and empty variants are synthetic. Faucet refusals, 402 challenges, chain calls and Python RPC responses are synthetic. The shared `@flop-lab/mcp` client tests the recorded MCP transport; no second MCP client is implemented.

Fixtures are immutable observations. Their TTL for a claim about current service state is zero. Runs make no public requests and have no response cache or live fallback. To deliberately replace the recordings, run `pnpm --filter @flop-lab/sdkconf record`. That command makes a bounded model request and a read-only MCP call. It stops on a failure without retrying. Published READMEs and type declarations are saved as base64 with content hashes to preserve their exact bytes.

## Importable API

```ts
import { runSuite, summarize } from "@flop-lab/sdkconf";

const report = await runSuite({ sdk: "client" });
console.log(summarize(report.results));
```

`runSuite` also accepts `scenario` and a `python` interpreter path. `parseReport` validates a saved report and rejects verdicts that contradict the attempts. `ScriptedService` exposes the same traceable transport for local tests.

## Python

The recorded Python check ran `flop-sdk` 0.2.0 in a throwaway virtual environment. It calls the published async health method with an in-process aiohttp substitute. It checks health fields only. It does not test Python wallet or retry behaviour.

To include it locally, create a temporary venv and install `flop-sdk==0.2.0`, then set `SDKCONF_PYTHON` to its Python executable. If that interpreter or version is absent, the result is SKIPPED. Nothing is installed by the runner.

## Development

```sh
pnpm --filter @flop-lab/sdkconf check
pnpm --filter @flop-lab/sdkconf exec tsx test/save-report.ts
```

Tests replay the recordings and verify failure detection against the actual packages. The mutation check changes the verdict for two failed attempts to PASS. The verdict test fails until the correct rule is restored.

## What this does not verify

This is not a full SDK certification. It does not verify live payment processing, real wallet creation, chain inclusion, settlement finality or production retries. No funds are used. Mock payments prove request control flow only. CLI coverage is startup and help. Python coverage is async health. The pinned SDKs do not document a hosted MCP transport, so that SDK check is skipped. Recorded fixtures do not establish current devnet state. The private upstream source and upstream aggregate tests were not available.
