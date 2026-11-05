// SPDX-License-Identifier: Apache-2.0
// Explicit maintainer operation. Records provenance and regenerates the catalogue.
import { mkdir, writeFile } from "node:fs/promises";
import { Transport, GATEWAY } from "../src/transport";
import { serialize, object, array, text } from "../src/validation";
import type { Claim } from "../src/types";

const transport = new Transport({ maxRequests: 3 });
const tools = (await transport.client.listTools()).value;
const gateway = object(await transport.models());
const source = object(array(object(object(array(gateway.data)[0])["x-flop"]).price_sources)[0]);
const expiryQuote = `"effective_at":${JSON.stringify(text(source.effective_at))},"expires_at":${JSON.stringify(text(source.expires_at))}`;
const measuredAt = new Date().toISOString();
await mkdir(new URL("../claims/", import.meta.url), { recursive: true });
await mkdir(new URL("../fixtures/", import.meta.url), { recursive: true });
for (const item of transport.evidence)
  await writeFile(new URL(`../fixtures/catalogue-${item.id}.json`, import.meta.url), serialize(item, 0));

const inputs: Record<string, Record<string, unknown>> = {
  flop_get_balance: { address: "$agent" },
  flop_check_htlc: { hash_lock: "$hashlock" },
  flop_get_compute_channel: { channel_id: "$channel" },
  flop_get_block: { number: "$block" },
  flop_indexer_query: { query: "{ __schema { queryType { name } } }" },
  flop_check_session: { owner: "$agent", delegate: "$miner" },
  flop_verify_tee_quote: { quote_hex: "0x00" },
  flop_get_inference_receipt: { hash_lock: "$hashlock" },
  flop_estimate_cost: { model_hash: "$model", prompt_length: 1 },
  flop_get_result: { task_id: "$hashlock" },
  flop_find_best_miner: { model_hash: "$model" },
  flop_get_model_info: { model_id: "$model" },
  flop_get_model_pricing: { model_id: "$model" },
  flop_estimate_inference_cost: { model_hash: "$model", input_tokens: 1 },
  flop_agent_skill_get: { id_or_path: "$skill" },
  flop_knowledge_search: { query: "protocol" },
  flop_knowledge_get: { id_or_path: "$concept" },
  flop_explain_requirement: { id: "R9.5" },
};
const claims: Claim[] = tools
  .filter((tool) => !/secret/i.test(tool.name))
  .map((tool) => ({
    id: `mcp-${tool.name.replace(/^flop_/, "").replaceAll("_", "-")}`,
    title: `${tool.name} minimal input`,
    source: {
      url: "https://mcp.flop.network/mcp",
      path: `tools/list#${tool.name}.inputSchema`,
      quote: tool.description?.split(". ")[0] ?? tool.name,
      measuredAt,
    },
    kind: "mcp",
    risk: "read-only",
    expected:
      "Advertised read-only tool accepts schema-valid minimal input and returns structured data; validate outputSchema when supplied.",
    check: tool.name === "flop_get_agent_card" ? "unavailable" : "probe",
    tool: tool.name,
    args: inputs[tool.name] ?? {},
    ...(tool.name === "flop_get_agent_card"
      ? {
          reason:
            "No observed on-chain agent id is available from the indexed settlement accounts. An account address is not an agent id.",
        }
      : {}),
  }));
await writeFile(new URL("../claims/mcp.yaml", import.meta.url), serialize(claims));

const doc = "https://docs.flop.network/docs/protocol-parameters";
const parameters = [
  ["block-time", "Block time", "1 s", "Average, with a roadmap toward sub-millisecond settlement"],
  ["block-size", "Block size limit", "2 MB", "Bounds how many proof hashes a block carries"],
  ["block-reward", "Block reward", "96 FLOP", "Era 0"],
  ["halving", "Halving period", "730 days", "63,072,000 blocks"],
  ["halving-count", "Number of halvings", "5", "Then constant in perpetuity"],
  ["miner-share", "Miner share", "75%", "Distributed by verified G_n contribution"],
  ["validator-share", "Validator share", "10%", "Shared across the active set"],
  ["agent-share", "Agent/broker share", "10%", "Minted to a protocol account; distribution not yet live"],
  ["staker-share", "Community-staker share", "5%", "Minted to a protocol account; distribution not yet live"],
  ["validator-cap", "Set size", "1,000", "Capped"],
  ["miner-stake", "Base self-stake", "10,000 FLOP", "Before the capacity bond"],
  ["challenge-window", "Challenge window", "~7 days", "Bounded by DA retention; under review to shorten toward hours"],
  ["response-deadline", "Response deadline", "2 hours", "Silence defaults to a fraud verdict"],
  ["dispute-bond", "Dispute bond", "100 FLOP", "Forfeited if the dispute is frivolous"],
  ["fraud-slash", "Fraud slash", "100%", "Slash, eject, blacklist"],
] as const;
const protocol: Claim[] = parameters.map(([id, title, expected, quote]) => ({
  id,
  title,
  source: { url: doc, quote, path: `${title} table row`, measuredAt },
  kind: "chain",
  risk: "read-only",
  expected,
  check: "unavailable",
  reason:
    "The public MCP surfaces do not expose the finalized runtime constant and its version. A design parameter or average is not proof of the live constant.",
}));
protocol.push({
  id: "audit-rate",
  title: "Soft-tier audit rate",
  source: {
    url: doc,
    quote: "About one session in forty; a governance dial, not a constant",
    path: "Audit rate table row",
    measuredAt,
  },
  kind: "chain",
  risk: "read-only",
  expected: "softTierSpotCheckRatePpm = 25000 (documented 2.5% design rate)",
  check: "audit",
});
await writeFile(new URL("../claims/protocol.yaml", import.meta.url), serialize(protocol));

const derived = (
  id: string,
  title: string,
  check: string,
  expected: string,
  url: string,
  quote: string,
  path?: string,
  tool?: string,
): Claim => ({
  id,
  title,
  check,
  expected,
  source: { url, quote, measuredAt, ...(path ? { path } : {}) },
  kind: check === "graphql" ? "graphql" : check === "contracts" || check === "expiry" ? "http" : "mcp",
  risk: "read-only",
  ...(tool ? { tool } : {}),
});
const discoveryQuote = tools.find((tool) => tool.name === "flop_discover_models")?.description ?? "";
const checks = [
  derived(
    "gateway-contract",
    "Gateway model list contract",
    "contracts",
    "assertModelList from @flop-labs/contracts@0.1.1 accepts the response",
    "https://www.npmjs.com/package/@flop-labs/contracts/v/0.1.1",
    "Validation checks structure without coercion, default insertion, or removal of fields.",
    "dist/generated/schemas.js#ModelList",
  ),
  derived(
    "price-source-expiry",
    "Price-source lifetime convention",
    "expiry",
    "expires_at - effective_at = 120000 ms. This is an observed catalogue convention, not a runtime guarantee.",
    GATEWAY,
    expiryQuote,
    "data[].x-flop.price_sources[]",
  ),
  derived(
    "model-registry",
    "Discovered models are registered",
    "registry",
    "Every discovered modelHash exists in the trust-root registry",
    "https://mcp.flop.network/mcp",
    discoveryQuote,
    "tools/list#flop_discover_models",
  ),
  derived(
    "model-serving",
    "Gateway and discovery serving sets",
    "serving",
    "For gateway-backed discovery, served, servingMiners and onlineMinerCount match gateway model and price-source sets",
    "https://mcp.flop.network/mcp",
    discoveryQuote,
    "tools/list#flop_discover_models",
  ),
  derived(
    "settlement-conservation",
    "Whole-tape escrow conservation",
    "settlements",
    "minerPaid + unusedEscrow + burned = escrow, using raw-unit integers for every row",
    "https://github.com/zkasuran/flop-lab/blob/38872e3/packages/mcp/src/api.ts",
    "Exact check of the documented split: what the miner got, what came back, and what was burned add up to the escrow.",
    "escrowConserved",
  ),
  derived(
    "settlement-pagination",
    "Settlement pagination",
    "pagination",
    "limit and offset are honoured, hasMore matches total and adjacent slices match",
    "https://mcp.flop.network/mcp",
    "Pagination offset",
    "tools/list#flop_list_settlements.inputSchema.properties.offset",
    "flop_list_settlements",
  ),
  derived(
    "offer-pagination",
    "Offer pagination",
    "pagination",
    "limit and offset are honoured, hasMore matches total and adjacent slices match",
    "https://mcp.flop.network/mcp",
    "Pagination offset",
    "tools/list#flop_list_session_offers.inputSchema.properties.offset",
    "flop_list_session_offers",
  ),
  derived(
    "invalid-limit",
    "Invalid pagination limit",
    "bad-input",
    "limit=0 is rejected with an explicit MCP error",
    "https://mcp.flop.network/mcp",
    "Maximum rows",
    "tools/list#flop_list_settlements.inputSchema.properties.limit.minimum=1",
    "flop_list_settlements",
  ),
  derived(
    "indexer-stats-fields",
    "GraphQL and MCP stats fields",
    "graphql",
    "Every field in flop_get_stats.stats exists on GraphQL type Stats",
    "https://mcp.flop.network/mcp",
    "The schema is introspectable",
    "tools/list#flop_indexer_query.description",
  ),
  derived(
    "simulated-tee-label",
    "Simulated verifier is labelled",
    "simulated",
    "verified=false, status=unverified and simulated=true",
    "https://mcp.flop.network/mcp",
    tools.find((tool) => tool.name === "flop_verify_tee_quote")?.description ?? "",
    "tools/list#flop_verify_tee_quote.description",
  ),
];
await writeFile(new URL("../claims/conformance.yaml", import.meta.url), serialize(checks));
const chaos: Claim[] = [
  [
    "chaos-spend-limit",
    "Agent spend-limit enforcement",
    "https://docs.flop.network/docs/agent-accounts-and-spend-control",
    "Spend limits and proxies put that boundary on-chain, where a bug in the agent cannot exceed it.",
    "An attempted spend beyond the account limit is rejected",
  ],
  [
    "chaos-session-budget",
    "Session-key exhaustion",
    "https://www.npmjs.com/package/@flop-labs/sdk/v/0.4.0",
    "Create a session key with spending limits.",
    "A session cannot authorize spending beyond its remaining limit",
  ],
  [
    "chaos-htlc-refund",
    "HTLC refund timing",
    "https://docs.flop.network/docs/atomic-swaps",
    "If the counter-transfer never confirms, the timelock returns the escrowed FLOP.",
    "Refund is unavailable before expiry and returns escrow after expiry",
  ],
  [
    "chaos-escrow-ceiling",
    "Direct-session escrow ceiling",
    "https://docs.flop.network/docs/send-to-specific-miner",
    "Transaction fees are additional.",
    "Escrow never exceeds max-flop; account for fees separately",
  ],
  [
    "chaos-expiry-refund",
    "Unacknowledged miner refund",
    "https://docs.flop.network/docs/send-to-specific-miner",
    "Both refund the channel escrow; fees remain spent.",
    "Unacknowledged force-open escrow is recoverable after expiry",
  ],
].map(([id, title, url, quote, expected]) => ({
  id: id!,
  title: title!,
  source: { url: url!, quote: quote!, measuredAt },
  kind: "sdk",
  risk: "spends-test-funds",
  expected: expected!,
  check: "unavailable",
  reason:
    "No verified public write transport, faucet/genesis match and throwaway wallet are available. No extrinsics were submitted. Recovery cannot be tested without these prerequisites.",
}));
await writeFile(new URL("../claims/chaos.yaml", import.meta.url), serialize(chaos));
console.log(
  serialize({
    measuredAt,
    claims: claims.length + protocol.length + checks.length + chaos.length,
    requests: transport.requests,
  }),
);
