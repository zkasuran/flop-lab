// SPDX-License-Identifier: Apache-2.0
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const schemaVersion = "1.0.0";
export const revalidateSeconds = 300;
export const definitions = {
  verifier: {
    title: "Verifier tape summary",
    page: "/verify",
    metrics: ["channels", "checks"],
    outcomes: ["PASS", "FAIL", "UNVERIFIABLE", "NOT_APPLICABLE"],
  },
  harness: {
    title: "Harness last bundled run",
    page: "/harness",
    metrics: ["claims", "requests", "flaky"],
    outcomes: ["PASS", "FAIL", "UNVERIFIABLE", "SKIPPED"],
  },
  spec: {
    title: "Spec diff",
    page: "/spec",
    metrics: ["comparisons", "transactions"],
    outcomes: ["MATCH", "DRIFT", "SPEC_ONLY", "RUNTIME_ONLY", "UNOBSERVABLE"],
  },
  contracts: {
    title: "MCP contract board",
    page: "/contracts",
    metrics: ["tools", "requests"],
    outcomes: ["PASS", "VIOLATION", "UNVERIFIABLE", "SKIPPED"],
  },
  models: {
    title: "Model checks",
    page: "/models",
    metrics: ["models", "checks", "errors"],
    outcomes: ["PASS", "FAIL", "UNKNOWN"],
  },
  status: { title: "Service status samples", page: "/status", metrics: ["samples", "passed", "failed"], outcomes: [] },
  watch: { title: "Watch default-rule replay", page: "/watch", metrics: ["polls", "alerts", "requests"], outcomes: [] },
} as const;
export type Endpoint = keyof typeof definitions;
export type Source = { url: string; measuredAt: string };
export type Result = {
  schemaVersion: typeof schemaVersion;
  tool: Endpoint;
  mode: "recorded" | "unavailable";
  measuredAt: string | null;
  sources: Source[];
  recordings: string[];
  revalidateSeconds: number;
  summary: { metrics: Record<string, number>; outcomes: Record<string, number> } | null;
  limitations: string[];
};
export const endpoints = Object.keys(definitions) as Endpoint[];
const text = { type: "string", minLength: 1 };
const time = { type: "string", format: "date-time" };
const url = { type: "string", format: "uri", pattern: "^https://" };
const strings = { type: "array", minItems: 1, maxItems: 100, items: text };
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const counts = (keys: readonly string[]) =>
  object(
    Object.fromEntries(keys.map((key) => [key, { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }])),
  );

/** Build a tool schema used by both HTTP validation and OpenAPI. @example resultSchema("models") */
export function resultSchema(tool: Endpoint) {
  const common = {
    schemaVersion: { const: schemaVersion },
    tool: { const: tool },
    revalidateSeconds: { const: revalidateSeconds },
    limitations: strings,
  };
  return {
    oneOf: [
      object({
        ...common,
        mode: { const: "recorded" },
        measuredAt: time,
        sources: {
          type: "array",
          minItems: 1,
          maxItems: 1000,
          uniqueItems: true,
          items: object({ url, measuredAt: time }),
        },
        recordings: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: url },
        summary: object({ metrics: counts(definitions[tool].metrics), outcomes: counts(definitions[tool].outcomes) }),
      }),
      object({
        ...common,
        mode: { const: "unavailable" },
        measuredAt: { type: "null" },
        sources: { type: "array", maxItems: 0 },
        recordings: { type: "array", maxItems: 0 },
        summary: { type: "null" },
      }),
    ],
  };
}

export const errorSchema = object({
  schemaVersion: { const: schemaVersion },
  error: { enum: ["bad_request", "not_found", "method_not_allowed", "rate_limited", "unavailable"] },
  message: text,
});
export const documentSchema = {
  type: "object",
  required: ["openapi", "info", "jsonSchemaDialect", "servers", "paths", "components"],
  properties: {
    openapi: { const: "3.1.0" },
    info: { type: "object" },
    jsonSchemaDialect: { const: "https://json-schema.org/draft/2020-12/schema" },
    servers: { type: "array" },
    paths: { type: "object" },
    components: { type: "object" },
  },
};
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validators = new Map(endpoints.map((tool) => [tool, ajv.compile(resultSchema(tool))]));

/** Reject missing evidence and inconsistent totals before serving it. @example parseResult("models", value) */
export function parseResult(tool: Endpoint, value: unknown): Result {
  const validate = validators.get(tool)!;
  if (!validate(value)) throw new Error(`Invalid ${tool} result: ${ajv.errorsText(validate.errors)}`);
  const result = value as Result;
  if (result.mode === "recorded") {
    const latest = Math.max(...result.sources.map((source) => Date.parse(source.measuredAt)));
    if (Date.parse(result.measuredAt!) !== latest)
      throw new Error("Measurement time must be the latest source observation");
    const { metrics, outcomes } = result.summary!;
    const total = Object.values(outcomes).reduce((sum, n) => sum + n, 0);
    const countKey = {
      verifier: "checks",
      harness: "claims",
      spec: "comparisons",
      contracts: "tools",
      models: "checks",
      status: null,
      watch: null,
    }[tool];
    if (countKey && metrics[countKey] !== total) throw new Error("Outcome totals do not match the measured count");
    if (tool === "status" && metrics.samples !== metrics.passed! + metrics.failed!)
      throw new Error("Status sample totals disagree");
  }
  return structuredClone(result);
}
