// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_URL, type CallResult } from "@flop-lab/mcp";
import { checkSchema, object, type SchemaCheck, type Tool } from "./schema";
import { inspectQuery } from "./query";

export const GATEWAY_URL = "https://api.flop.network/v1/models";
export const DEFAULT_MODEL = "qwen/qwen2.5-0.5b-instruct";
export type Observation = {
  tool: string;
  args: Record<string, unknown>;
  source: string;
  measuredAt: string;
  durationMs: number | null;
  attempts: number;
  value: unknown;
  check: SchemaCheck;
  curl: string;
};

/** Validate user arguments before a network call. @example validateInput(tool, {limit: 20}) */
export function validateInput(tool: Tool, args: Record<string, unknown>): void {
  if (!tool.allowed) throw new Error("Tool is outside the read-only allowlist");
  const text = JSON.stringify(args);
  if (new TextEncoder().encode(text).length > 16_384) throw new Error("Arguments exceed 16384 bytes");
  const properties = object(tool.inputSchema.properties ?? {});
  for (const key of Object.keys(args)) if (!Object.hasOwn(properties, key)) throw new Error(`Unknown argument: ${key}`);
  const result = checkSchema(tool.inputSchema, args);
  if (result.status !== "pass") throw new Error(result.errors.join("; "));
  for (const key of ["limit", "max_results", "offset"]) {
    const value = args[key];
    if (
      value !== undefined &&
      (typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < (key === "offset" ? 0 : 1) ||
        value > (key === "offset" ? 10_000 : 100))
    )
      throw new Error(`Invalid bounded ${key}`);
  }
  if (tool.name === "flop_indexer_query") inspectQuery(String(args.query), object(args.variables ?? {}));
}

/** Build a shell-quoted, exact tools/call request. @example curlCommand("flop_get_stats", {}) */
export function curlCommand(tool: string, args: Record<string, unknown>): string {
  const quote = (text: string) => `'${text.replace(/'/g, `'"'"'`)}'`;
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } });
  return [
    `curl --max-time 20 ${quote(DEFAULT_URL)}`,
    "  -H 'Content-Type: application/json'",
    "  -H 'Accept: application/json, text/event-stream'",
    "  -H 'User-Agent: flop-lab-console/0.1'",
    `  --data-raw ${quote(body)}`,
  ].join(" \\\n");
}

/** Keep schema conformance separate from correctness claims. @example observation(tool, {}, result) */
export function observation(tool: Tool, args: Record<string, unknown>, result: CallResult<unknown>): Observation {
  return {
    tool: tool.name,
    args,
    source: DEFAULT_URL,
    measuredAt: result.measuredAt,
    durationMs: result.durationMs,
    attempts: result.attempts,
    value: result.value,
    check: checkSchema(tool.outputSchema, result.value),
    curl: curlCommand(tool.name, args),
  };
}

export type EstimateInput = { model: string; tokens: number; outputTokens: number };

/** Use the same input and output token counts across pricing calls. @example estimateCalls({model: "qwen/qwen2.5-0.5b-instruct", tokens: 1000, outputTokens: 500}) */
export function estimateCalls(input: EstimateInput): { tool: string; args: Record<string, unknown> }[] {
  if (!input.model.trim() || input.model.length > 256) throw new Error("Provide a model id");
  for (const number of [input.tokens, input.outputTokens])
    if (!Number.isSafeInteger(number) || number < 1 || number > 1_000_000)
      throw new Error("Token counts must be integers from 1 to 1000000");
  const total = input.tokens + input.outputTokens;
  return [
    {
      tool: "flop_estimate_cost",
      args: { model_hash: input.model, prompt_length: input.tokens, output_length: input.outputTokens },
    },
    {
      tool: "flop_estimate_inference_cost",
      args: {
        model_hash: input.model,
        input_tokens: input.tokens,
        output_tokens: input.outputTokens,
        urgency: "normal",
        tee_required: true,
      },
    },
    { tool: "flop_get_model_pricing", args: { model_id: input.model, tokens_estimate: total } },
    { tool: "flop_compare_pricing", args: { models: [input.model], tokens_estimate: total } },
  ];
}

export type PriceSource = { miner: string; source: string; effectiveAt: string; expiresAt: string };
export type GatewayPrice = {
  source: string;
  measuredAt: string;
  model: string;
  prompt: string;
  completion: string;
  sources: PriceSource[];
};

/** Check the gateway price fields used in arithmetic. @example gatewayPrice(response, model, measuredAt) */
export function gatewayPrice(value: unknown, model: string, measuredAt: string): GatewayPrice | null {
  const rows = object(value).data;
  if (!Array.isArray(rows)) throw new Error("Gateway response has no model array");
  const item = rows.find((row: unknown) => object(row).id === model);
  if (!item) return null;
  const row = object(item);
  const pricing = object(row.pricing);
  const price = (value: unknown) => {
    if (typeof value !== "string" || !/^\d{1,18}(\.\d{1,18})?$/.test(value))
      throw new Error("Invalid gateway token price");
    return value;
  };
  const sources = object(row["x-flop"]).price_sources;
  if (!Array.isArray(sources)) throw new Error("Gateway has no price sources");
  return {
    source: GATEWAY_URL,
    measuredAt,
    model,
    prompt: price(pricing.prompt),
    completion: price(pricing.completion),
    sources: sources.map((item: unknown) => {
      const source = object(item);
      for (const key of ["miner_address", "source", "effective_at", "expires_at"])
        if (typeof source[key] !== "string") throw new Error("Invalid price source");
      const effective = String(source.effective_at),
        expires = String(source.expires_at);
      if (
        !Number.isFinite(Date.parse(effective)) ||
        !Number.isFinite(Date.parse(expires)) ||
        Date.parse(effective) >= Date.parse(expires)
      )
        throw new Error("Invalid source validity interval");
      return {
        miner: String(source.miner_address),
        source: String(source.source),
        effectiveAt: effective,
        expiresAt: expires,
      };
    }),
  };
}

/** Exact fixed-point FLOP arithmetic, without floating-point rounding. @example tokenCost("0.006", "0.006", 1000, 500) === "9" */
export function tokenCost(prompt: string, completion: string, input: number, output: number): string {
  for (const count of [input, output])
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid token count");
  const scaled = (value: string) => {
    if (!/^\d{1,18}(\.\d{1,18})?$/.test(value)) throw new Error("Invalid decimal price");
    const [whole = "0", fraction = ""] = value.split(".");
    return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
  };
  const total = scaled(prompt) * BigInt(input) + scaled(completion) * BigInt(output);
  const digits = total.toString().padStart(19, "0");
  return `${digits.slice(0, -18)}.${digits.slice(-18)}`.replace(/\.?0+$/, "") || "0";
}

/** Price freshness at an explicit clock instant. @example sourceState(source, Date.now()) */
export function sourceState(source: PriceSource, now: number): "current" | "expired" | "not effective" {
  if (now < Date.parse(source.effectiveAt)) return "not effective";
  return now >= Date.parse(source.expiresAt) ? "expired" : "current";
}
