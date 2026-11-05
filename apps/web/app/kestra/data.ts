// SPDX-License-Identifier: Apache-2.0
import observed from "./observed.json";

export const readTasks = [
  `  - id: stats
    type: io.kestra.plugin.flop.network.Stats`,
  `  - id: tape
    type: io.kestra.plugin.flop.settlements.List
    maxResults: 100
    store: true`,
  `  - id: verify
    type: io.kestra.plugin.flop.settlements.Verify
    settlements: "{{ outputs.tape.rows }}"
    failOnMismatch: true`,
  `  - id: models
    type: io.kestra.plugin.flop.models.List`,
] as const;

export const observeFlow = `# SPDX-License-Identifier: Apache-2.0
id: flop_observe
namespace: company.flop
tasks:
${readTasks.join("\n")}
`;

export const watchFlow = `# SPDX-License-Identifier: Apache-2.0
id: flop_watch
namespace: company.flop
triggers:
  - id: tape
    type: io.kestra.plugin.flop.settlements.NewSettlement
    interval: PT1M
    maxResults: 1000
tasks:
  - id: verify
    type: io.kestra.plugin.flop.settlements.Verify
    settlements: "{{ trigger.rows }}"
`;

const chatFlow = `# Local mock only. Start your mock on port 3370 first.
id: flop_chat_mock
namespace: company.flop
tasks:
  - id: chat
    type: io.kestra.plugin.flop.inference.ChatCompletion
    gatewayUrl: http://127.0.0.1:3370/v1
    apiKey: mock-e2e-key
    model: qwen/qwen2.5-0.5b-instruct
    prompt: Say hello.
    maxPricePerGflop: "0.01"
    maxCostFlop: "0.01"
    maxTokens: 32
`;

export const recordedRequests = observed.stats.requestCount + observed.tape.requestCount + observed.models.requestCount;

export const stages = [
  {
    id: "stats",
    name: "Read the network",
    type: "network.Stats",
    label: "Recorded live read",
    metric: `${observed.stats.accounts.toLocaleString("en-US")} accounts`,
    description:
      "Read the indexer's block height, accounts, active operators and proof count. Each output carries its source and measurement time.",
    note: "Full task output. Zero operators and proofs are reported values from this capture.",
    yaml: readTasks[0],
    output: observed.stats,
    measuredAt: observed.stats.measuredAt,
    source: observed.stats.source,
  },
  {
    id: "tape",
    name: "Collect settlements",
    type: "settlements.List",
    label: "Recorded live read",
    metric: `${observed.tape.count} rows returned`,
    description:
      "Page through the tape up to your chosen limit. Keep the rows in the flow or write an ION file to Kestra internal storage.",
    note: observed.excerpts.tape,
    yaml: readTasks[1],
    output: observed.tape,
    measuredAt: observed.tape.measuredAt,
    source: observed.tape.source,
  },
  {
    id: "verify",
    name: "Check the arithmetic",
    type: "settlements.Verify",
    label: "Local check of live rows",
    metric: `${observed.verify.count} arithmetic ${observed.verify.status}`,
    description:
      "Check exact integer conservation, nonnegative amounts and descending block order. Fail the task on a mismatch. Empty input returns NO_DATA.",
    note: `${observed.excerpts.verify} PASS is not proof of inference, finality or indexer truth.`,
    yaml: readTasks[2],
    output: observed.verify,
    measuredAt: observed.verify.checkedAt,
    source: observed.tape.source,
  },
  {
    id: "models",
    name: "Inspect model sources",
    type: "models.List",
    label: "Recorded live read",
    metric: `${observed.models.count} model returned`,
    description:
      "Read the keyless model catalogue and annotate each miner source with freshness at the worker's clock. Nominal sources do not establish a GFLOP price.",
    note: observed.excerpts.models,
    yaml: readTasks[3],
    output: observed.models,
    measuredAt: observed.models.measuredAt,
    source: observed.models.source,
  },
  {
    id: "watch",
    name: "React to the tape",
    type: "settlements.NewSettlement",
    label: "Controlled cursor replay",
    metric: `${observed.watch.count} replayed settlement`,
    description:
      "The first poll records a namespace KV cursor. Later polls emit unseen events. Deduplicate downstream. Rate limits and server outages skip the poll.",
    note: `${observed.excerpts.watch} Cursor updates and execution creation are not atomic.`,
    yaml: watchFlow,
    output: observed.watch,
    measuredAt: observed.watch.measuredAt,
    source: observed.watch.source,
  },
  {
    id: "chat",
    name: "Guard a completion",
    type: "inference.ChatCompletion",
    label: "Local mock only",
    metric: "Live gateway unverified",
    description:
      "Check an explicit fresh GFLOP price before sending a single paid request. The recorded devnet-nominal sources lack that price, so the task refuses them.",
    note: `${observed.excerpts.chat} This YAML requires the local mock. Gateway cost enforcement is unverified.`,
    yaml: chatFlow,
    output: observed.chat,
    measuredAt: observed.chat.measuredAt,
    source: observed.chat.source,
  },
] as const;

export { observed };
