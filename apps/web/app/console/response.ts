// SPDX-License-Identifier: Apache-2.0
import { checkSchema, object } from "../../../../packages/console/src/schema";
import type { ConsoleResponse } from "../../../../packages/console/src/service";

const observation = {
  type: "object",
  required: ["tool", "args", "source", "measuredAt", "value", "check", "curl", "durationMs", "attempts"],
  properties: {
    tool: { type: "string" },
    args: { type: "object" },
    source: { type: "string", const: "https://mcp.flop.network/mcp" },
    measuredAt: { type: "string", format: "date-time" },
    curl: { type: "string" },
    durationMs: { type: ["number", "null"] },
    attempts: { type: "integer", minimum: 0 },
    check: {
      type: "object",
      required: ["status", "errors"],
      properties: {
        status: { enum: ["pass", "fail", "unchecked"] },
        errors: { type: "array", items: { type: "string" } },
      },
    },
  },
};
const gateway = {
  type: ["object", "null"],
  required: ["source", "measuredAt", "model", "prompt", "completion", "sources"],
  properties: {
    source: { const: "https://api.flop.network/v1/models" },
    measuredAt: { type: "string", format: "date-time" },
    model: { type: "string" },
    prompt: { type: "string", pattern: "^\\d{1,18}(\\.\\d{1,18})?$" },
    completion: { type: "string", pattern: "^\\d{1,18}(\\.\\d{1,18})?$" },
    sources: {
      type: "array",
      items: {
        type: "object",
        required: ["miner", "source", "effectiveAt", "expiresAt"],
        properties: {
          miner: { type: "string" },
          source: { type: "string" },
          effectiveAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
};
const payloads = [
  {
    type: "object",
    required: ["kind", "catalog"],
    properties: {
      kind: { const: "tools" },
      catalog: {
        type: "object",
        required: ["tools", "source", "measuredAt"],
        properties: {
          source: { type: "string" },
          measuredAt: { type: "string", format: "date-time" },
          tools: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "description", "allowed", "inputSchema"],
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                allowed: { type: "boolean" },
                inputSchema: { type: "object" },
                outputSchema: { type: "object" },
              },
            },
          },
        },
      },
    },
  },
  { type: "object", required: ["kind", "observation"], properties: { kind: { const: "call" }, observation } },
  {
    type: "object",
    required: ["kind", "observation", "fields"],
    properties: {
      kind: { const: "introspect" },
      observation,
      fields: {
        type: "array",
        items: {
          type: "object",
          required: ["type", "field", "args", "returns"],
          properties: {
            type: { type: "string" },
            field: { type: "string" },
            returns: { type: "string" },
            args: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
  {
    type: "object",
    required: ["kind", "estimate"],
    properties: {
      kind: { const: "estimate" },
      estimate: {
        type: "object",
        required: ["input", "observations", "errors", "gateway", "gatewayError"],
        properties: {
          input: {
            type: "object",
            required: ["model", "tokens", "outputTokens"],
            properties: {
              model: { type: "string" },
              tokens: { type: "integer", minimum: 1, maximum: 1000000 },
              outputTokens: { type: "integer", minimum: 1, maximum: 1000000 },
            },
          },
          observations: { type: "array", items: observation },
          errors: {
            type: "array",
            items: {
              type: "object",
              required: ["tool", "message"],
              properties: { tool: { type: "string" }, message: { type: "string" } },
            },
          },
          gateway,
          gatewayError: { type: ["string", "null"] },
        },
      },
    },
  },
];

/** Check the same-origin response before rendering data. @example parseConsoleResponse(await response.json()) */
export function parseConsoleResponse(value: unknown): ConsoleResponse {
  const check = checkSchema(
    {
      type: "object",
      required: ["payload", "cached", "servedAt", "requests", "budgetRemaining"],
      properties: {
        payload: { oneOf: payloads },
        cached: { type: "boolean" },
        servedAt: { type: "string", format: "date-time" },
        requests: { type: "integer", minimum: 0 },
        budgetRemaining: { type: "integer", minimum: 0 },
      },
    },
    value,
  );
  if (check.status !== "pass") throw new Error(`Invalid console response: ${check.errors.join("; ")}`);
  return object(value) as unknown as ConsoleResponse;
}
