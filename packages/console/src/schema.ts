// SPDX-License-Identifier: Apache-2.0
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export type JsonObject = Record<string, unknown>;
export type SchemaCheck = { status: "pass" | "fail" | "unchecked"; errors: string[] };
export type Tool = {
  name: string;
  description: string;
  inputSchema: JsonObject;
  outputSchema?: JsonObject;
  allowed: boolean;
};

// Explicit policy. Discovery annotations alone cannot grant access to new tools.
export const READ_ONLY = new Set([
  "flop_health",
  "flop_get_balance",
  "flop_check_htlc",
  "flop_trust_root",
  "flop_get_compute_channel",
  "flop_list_session_offers",
  "flop_list_settlements",
  "flop_list_swaps",
  "flop_indexer_query",
  "flop_get_stats",
  "flop_get_block",
  "flop_get_poui_leaderboard",
  "flop_check_session",
  "flop_verify_tee_quote",
  "flop_get_tcb_status",
  "flop_get_inference_receipt",
  "flop_estimate_cost",
  "flop_get_result",
  "flop_discover_models",
  "flop_find_best_miner",
  "flop_get_model_info",
  "flop_get_model_pricing",
  "flop_compare_pricing",
  "flop_list_providers",
  "flop_estimate_inference_cost",
  "flop_get_agent_card",
  "flop_agent_pack_manifest",
  "flop_agent_skill_get",
  "flop_knowledge_search",
  "flop_knowledge_get",
  "flop_explain_requirement",
  "flop_knowledge_manifest",
]);

/** Require a plain JSON object. @example object({query: "{ stats { tps } }"}) */
export function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object");
  return value as JsonObject;
}

/** Validate without defaults, coercion or data removal. @example checkSchema({type: "integer"}, 1) */
export function checkSchema(schema: JsonObject | undefined, value: unknown): SchemaCheck {
  if (!schema) return { status: "unchecked", errors: ["No output schema advertised. Shape is not verified."] };
  try {
    const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const pass = validate(value);
    return {
      status: pass ? "pass" : "fail",
      errors: (validate.errors ?? [])
        .slice(0, 20)
        .map((error) => `${error.instancePath || "/"}: ${error.message ?? error.keyword}`),
    };
  } catch (error) {
    return {
      status: "fail",
      errors: [`Schema cannot be checked: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/** Check discovery before exposing forms or accepting a tool. @example parseTools([{name: "flop_health", inputSchema: {type: "object"}}]) */
export function parseTools(value: unknown): Tool[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Invalid tool list");
  const seen = new Set<string>();
  return value.map((item) => {
    const row = object(item);
    if (typeof row.name !== "string" || !/^flop_[a-z_]+$/.test(row.name) || seen.has(row.name))
      throw new Error("Invalid or duplicate tool name");
    seen.add(row.name);
    const inputSchema = object(row.inputSchema);
    if (inputSchema.type !== "object") throw new Error("Tool input schema must describe an object");
    return {
      name: row.name,
      description: typeof row.description === "string" ? row.description : "",
      inputSchema,
      ...(row.outputSchema === undefined ? {} : { outputSchema: object(row.outputSchema) }),
      allowed: READ_ONLY.has(row.name) && object(row.annotations ?? {}).readOnlyHint === true,
    };
  });
}

/** Decode one form field using its advertised type. Empty optional fields are omitted. @example fieldValue({type: "integer"}, "20") */
export function fieldValue(schema: JsonObject, text: string): unknown {
  if (schema.type === "string") return text;
  if (!text.trim()) return undefined;
  return JSON.parse(text) as unknown;
}
