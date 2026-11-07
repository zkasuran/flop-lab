# flop-lab check

Can a project run FLOP evidence checks in CI with a fixed request budget? This Action runs the suite's tape arithmetic, spec comparison and MCP stats contract audit. It writes a JSON report and a GitHub job summary. Recorded mode is the default.

## Quick start

From the repository root after `pnpm install`:

```sh
pnpm --filter @flop-lab/action build
node packages/action/dist/cli.js --checks tape
pnpm --filter @flop-lab/action local-runner
```

The same command is available as `node packages/cli/dist/cli.js action --checks tape` after building the suite.

## GitHub Action

```yaml
name: FLOP evidence
on: [pull_request]
permissions:
  contents: read
jobs:
  flop:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: zkasuran/flop-lab@main
        id: flop
        with:
          checks: tape
          mode: recorded
          max-requests: '0'
      - run: test -f "$REPORT"
        env:
          REPORT: ${{ steps.flop.outputs.report }}
```

Pin the Action to a reviewed full commit SHA for a stable CI dependency. It does not need a checkout of the caller's repository. Bootstrap installs Node and pnpm with SHA-pinned actions. It installs locked dependencies in the Action directory with lifecycle scripts disabled. The local runner checks the same CLI, input environment, output file and summary file used by the composite step.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `checks` | `tape` | Unique comma-separated names: `tape`, `spec`, `contracts`. |
| `mode` | `recorded` | Replay committed raw observations or read public MCP in `live` mode. |
| `max-requests` | `10` | Total suite HTTP attempts across all selected checks. Integer from 0 through 30. Retries consume this budget. |
| `fail-on-incomplete` | `true` | Exit with a failure for unavailable or incomplete evidence. Set `false` to allow that exit while keeping status `incomplete`. |

The budget applies to suite service requests. GitHub Action downloads and dependency installation are separate bootstrap traffic. Live mode only posts read-only calls to `https://mcp.flop.network/mcp`. Redirects are refused. The shared MCP client handles spacing and bounded retries. A run has no cross-run cache. Each HTTP attempt has a timeout and the shared transport stops accepting work after its deadline.

```sh
node packages/action/dist/cli.js --mode live --checks tape,spec,contracts --max-requests 10
```

Checks run in the supplied order. If an earlier check exhausts the budget, later checks report incomplete. No live request is made in recorded mode.

## Outputs and exit codes

| Output | Meaning |
| --- | --- |
| `status` | `pass`, `fail` or `incomplete`. |
| `requests` | Measured suite HTTP attempts during this run. |
| `report` | Absolute JSON report path in the runner temporary directory. |

Reports include evaluation time, elapsed time, evidence source URLs, observation times and counts. Evaluation time does not replace observation time. Job summaries escape returned text and show a bounded excerpt. The JSON report holds the full result details.

Exit 0 means pass or explicitly allowed incomplete. Exit 1 means a failed check. Exit 2 means incomplete evidence or invalid input. A failure takes precedence over incomplete evidence. An empty result is incomplete.

## Check boundaries

- `tape`: use `@flop-lab/verifier` to check exact escrow and displayed-price arithmetic. Live mode samples up to the requested first page. Recorded mode replays the sampled settlements in the verifier's `v2-channel.json` evidence bundle.
- `spec`: use `@flop-lab/spec` to compare the pinned paper with public observations. Missing enforcement evidence stays incomplete. The paper's quoted SHA and source dates remain in the evidence.
- `contracts`: use `@flop-lab/mcpaudit` to audit `flop_get_stats`. Recorded mode replays `audit-1.json`, `audit-32.json` and `audit-33.json` from that package. The absence of an advertised output schema stays incomplete.

The existing source fixtures retain the raw response, source URL and observation time. This package references them directly instead of creating a second recording.

## Library

```ts
import { parseOptions, runChecks } from '@flop-lab/action';

const report = await runChecks(parseOptions({ checks: 'tape', mode: 'recorded' }));
console.log(report.status, report.requests);
```

`runChecks` also accepts an injected fetch for deterministic transport tests. The endpoint and aggregate budget remain enforced with that injection.

## What this does not verify

This Action does not verify inference, consensus, funds moving or the caller's application. Recorded mode checks historical observations. It makes no claim about current service health. Tape mode does not audit every historical settlement or prove agreed prices. The spec comparison cannot prove runtime enforcement. The MCP check covers the stats tool only. A schema match does not prove that a reported value is true. The local runner does not emulate GitHub's hosted runner or exercise third-party Action bootstrap downloads.
