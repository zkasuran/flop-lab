// SPDX-License-Identifier: Apache-2.0
import { object, schemaFindings } from "./schema";
import type { Probe, Tool } from "./types";

const zero = `0x${"0".repeat(64)}`;
const model = "qwen/qwen2.5-0.5b-instruct";
// Explicit allowlist. New tools never execute from an untrusted readOnlyHint alone.
const minimal: Record<string, Record<string, unknown>> = {
  flop_health: {},
  flop_get_balance: { address: zero },
  flop_check_htlc: { hash_lock: zero },
  flop_trust_root: {},
  flop_get_compute_channel: { channel_id: zero },
  flop_list_session_offers: { limit: 1 },
  flop_list_settlements: { limit: 1 },
  flop_list_swaps: { limit: 1 },
  flop_indexer_query: { query: "query AuditSchema { __schema { queryType { name } } }" },
  flop_get_stats: {},
  flop_get_block: { number: 0 },
  flop_get_poui_leaderboard: { limit: 1 },
  flop_check_session: { owner: zero, delegate: zero },
  flop_verify_tee_quote: { quote_hex: "00" },
  flop_get_tcb_status: {},
  flop_get_inference_receipt: { hash_lock: zero },
  flop_estimate_cost: { model_hash: model, prompt_length: 1 },
  flop_get_result: { task_id: zero },
  flop_discover_models: { max_results: 1 },
  flop_find_best_miner: { model_hash: model, max_results: 1 },
  flop_get_model_info: { model_id: model },
  flop_get_model_pricing: { model_id: model, tokens_estimate: 1 },
  flop_compare_pricing: { models: [model], tokens_estimate: 1 },
  flop_list_providers: {},
  flop_estimate_inference_cost: { model_hash: model, input_tokens: 1, output_tokens: 1 },
  flop_get_agent_card: { agent_id: zero },
  flop_agent_pack_manifest: {},
  flop_agent_skill_get: { id_or_path: "flop" },
  flop_agent_pack_install: { target: "generic", mode: "remote" },
  flop_knowledge_search: { query: "inference", limit: 1 },
  flop_knowledge_get: { id_or_path: "mcp-tools/flop_estimate_inference_cost" },
  flop_explain_requirement: { id: "R9.5" },
  flop_knowledge_manifest: {},
};

/** Plan small allowlisted read-only inputs. Unknown tools are skipped. @example planProbes(tool) */
export function planProbes(tool: Tool, seeds: Record<string, string> = {}): Probe[] {
  const base = minimal[tool.name];
  if (!base || tool.annotations?.readOnlyHint !== true) return [];
  const args = { ...base };
  if (tool.name === "flop_knowledge_get" && seeds.concept) args.id_or_path = seeds.concept;
  if (tool.name === "flop_agent_skill_get" && seeds.skill) args.id_or_path = seeds.skill;
  if (tool.name === "flop_get_compute_channel" && seeds.channel) args.channel_id = seeds.channel;
  if (tool.name === "flop_get_balance" && seeds.address) args.address = seeds.address;
  if (schemaFindings(tool.inputSchema, args, "input").length)
    throw new Error("Safe minimal input no longer matches advertised schema");
  const probes: Probe[] = [{ label: "minimal", args }];
  const properties = object(tool.inputSchema.properties ?? {});
  // One small valid edge, never an unbounded max row count or expensive query.
  for (const [key, value] of Object.entries(properties)) {
    const schema = object(value);
    let boundary: unknown;
    if (Array.isArray(schema.enum)) boundary = schema.enum.at(-1);
    else if (schema.type === "string")
      boundary = "a".repeat(typeof schema.minLength === "number" ? Math.min(schema.minLength, 128) : 0);
    else if (schema.type === "array") boundary = [];
    else if (schema.type === "boolean") boundary = false;
    else if (schema.type === "number" || schema.type === "integer") boundary = 0;
    else continue;
    if (key === "query" && tool.name === "flop_indexer_query") boundary = "query { __typename }";
    if (key === "mode") continue;
    const candidate = { ...args, [key]: boundary };
    if (
      !schemaFindings(tool.inputSchema, candidate, "input").length &&
      JSON.stringify(candidate) !== JSON.stringify(args)
    ) {
      probes.push({ label: "boundary", args: candidate });
      break;
    }
  }
  const key = Object.keys(properties)[0];
  const invalid: unknown = key ? { ...args, [key]: null } : [];
  if (!schemaFindings(tool.inputSchema, invalid, "input").length)
    throw new Error("No invalid probe could be certified locally");
  probes.push({ label: "invalid", args: invalid });
  return probes;
}
