# flop-lab MCP server

How does an agent call flop-lab tools? Start this stdio MCP server. It exposes read-only suite operations with strict input and output schemas. Each result carries source observations, capture times and explicit limits.

## Quick start

Run from a checkout with Node 22 and pnpm:

```sh
pnpm install
pnpm --filter @flop-lab/mcp-server build
node packages/mcp-server/dist/cli.js --recorded --call lab_verify_tape --args '{"limit":1}'
```

For an MCP client, start `node /absolute/path/to/flop-lab/packages/mcp-server/dist/cli.js`. The unified command is `flop mcp` after building the CLI. Package binary: `flop-lab-mcp`. These packages are workspace-local.

```json
{
  "mcpServers": {
    "flop-lab": {
      "command": "node",
      "args": ["/absolute/path/to/flop-lab/packages/mcp-server/dist/cli.js"]
    }
  }
}
```

Append `--recorded` for offline replay. Stdout contains protocol messages only. Diagnostics go to stderr. `--list` prints the same declaration used by `tools/list`. `--call <name> --args '<JSON>'` runs a single operation for terminal inspection.

## Operations

The [agent skill](agent-pack/skills/flop-lab-tools/SKILL.md) maps questions to stable tool names. It includes channel and tape verification, miner ranking and routing, policy evaluation, a bounded harness run, one challenge-review snapshot, spec comparison, contract audit, explorer lookup, indexer audit, a recorded DID trail and offline doctor probes.

The harness operation checks the gateway contract only. Its spend ceiling is zero. The contract audit targets `flop_knowledge_get`. The DID operation uses the retained public capture. Doctor runs offline and skips port binding. Recorded doctor mode replays the bundled local miner-role capture.

Recorded entity lookups require the captured identifier. The indexer capture uses its fixed sample size. `src/examples.ts` contains accepted example inputs. Wrong identifiers fail instead of returning unrelated evidence.

## Importable API

```ts
import { createSuite, createServer, listTools } from "@flop-lab/mcp-server";

const suite = createSuite({ recorded: true });
const result = await suite.call("lab_verify_tape", { limit: 1 });
console.log(result.evidence);
console.log(listTools().tools.map(tool => tool.name));
// await createServer().connect(yourTransport);
```

The server and page derive declarations from one registry. Inputs reject unknown fields. Outputs are checked before caching or transport. The structured payload selects useful fields from each package report. It does not claim to return every native report field. Text content is exactly the same JSON as structured content.

`requests` counts physical HTTP attempts for that invocation, including retries. Replay and completed cache hits report zero. The registry exposes 13 operations.

`mode` distinguishes live, recorded and local execution. `executedAt` is computation time. `evidence[].measuredAt` is observation time. A cache hit does not change either time. Historical ranking evaluates the captured sample at capture time. Routing evaluates eligibility at execution time and refuses expired quotes.

## Bounds and checks

Successful non-local results cache for 30 seconds with at most 64 keys. Package collectors also keep their documented caches. Calls serialize with at most 8 pending operations. A request line is limited to 128 KiB. The shared network boundary limits each call to 40 HTTP attempts, a 60-second request-start window and 192 KiB per response. Each HTTP attempt has an 8-second timeout covering body reads. Existing package clients own retry backoff for 429 and 5xx. Smaller operation-specific budgets still apply. There is no background polling.

Run `pnpm --filter @flop-lab/mcp-server check`. Tests spawn the server, perform initialization, list tools, call every operation with retained observations and validate structured results with an independent JSON Schema validator. Policy denial, expired routes, unknown fields, wrong identifiers, cache expiry and transport limits have negative checks.

Measured locally on 2026-11-06T06:41:01.936Z with Node v22.22.2: five built-process runs reached initialization plus `tools/list` in 296.11 to 497.60 ms. Each then replayed a tape row with zero HTTP attempts. Run `pnpm --filter @flop-lab/mcp-server exec tsx scripts/benchmark.ts` to measure your machine. These are local startup observations, not service latency claims.

The raw pack observations are in `fixtures/`. Other network recordings stay in their owning packages. Their raw responses and original source times are reused without relabeling them as live. The local doctor capture retains raw probe evidence.

## What this does not verify

This does not prove inference, GPU execution, chain finality, source authenticity or the completeness of an indexer sample. It does not spend, sign, reserve funds or submit challenges. A supplied Spendguard history is not checked against a ledger. Recorded data is not current network state. The agent pack follows the published layout but field-level compatibility with the hosted manifest could not be checked because the service returned `agent pack missing`. No npm release, hosted deployment or proprietary client installation is verified.
