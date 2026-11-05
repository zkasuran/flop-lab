// SPDX-License-Identifier: Apache-2.0
import { Ajv } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { Finding, Tool } from "./types";

const options = { strict: false, allErrors: true, coerceTypes: false, removeAdditional: false, useDefaults: false };
const draft7 = new Ajv(options);
const draft2020 = new Ajv2020(options);
addFormats(draft7);
addFormats(draft2020);

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}

function at(value: unknown, path: string): unknown {
  for (const part of path.split("/").slice(1)) {
    if (!value || typeof value !== "object") return null;
    value = (value as Record<string, unknown>)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return value ?? null;
}

/** Validate without mutating data. Schema compilation errors remain errors. @example schemaFindings({type: "string"}, 1, "input") */
export function schemaFindings(schema: Record<string, unknown>, value: unknown, kind: "input" | "output"): Finding[] {
  const ajv = schema.$schema === undefined || String(schema.$schema).includes("2020-12") ? draft2020 : draft7;
  const validate = ajv.compile(schema);
  if (validate(value)) return [];
  return (validate.errors ?? []).map((error) => {
    const suffix =
      error.keyword === "additionalProperties"
        ? `/${String(error.params.additionalProperty).replace(/~/g, "~0").replace(/\//g, "~1")}`
        : "";
    return {
      kind,
      message: error.message ?? error.keyword,
      schemaPath: error.schemaPath,
      instancePath: error.instancePath + suffix,
      value: at(value, error.instancePath + suffix),
    };
  });
}

/** Check discovery before using names or schemas. @example parseTools({tools: []}) */
export function parseTools(value: unknown): Tool[] {
  const tools = object(value).tools;
  if (!Array.isArray(tools)) throw new Error("Discovery has no tools array");
  const seen = new Set<string>();
  return tools.map((value) => {
    const tool = object(value);
    if (typeof tool.name !== "string" || !/^flop_[a-z_]+$/.test(tool.name) || seen.has(tool.name))
      throw new Error("Invalid or duplicate tool name");
    seen.add(tool.name);
    const inputSchema = object(tool.inputSchema);
    const outputSchema = tool.outputSchema === undefined ? undefined : object(tool.outputSchema);
    const annotations = tool.annotations === undefined ? undefined : object(tool.annotations);
    return {
      name: tool.name,
      inputSchema,
      ...(outputSchema ? { outputSchema } : {}),
      ...(annotations ? { annotations: { readOnlyHint: annotations.readOnlyHint === true } } : {}),
    };
  });
}
