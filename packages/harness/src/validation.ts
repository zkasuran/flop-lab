// SPDX-License-Identifier: Apache-2.0
import { Ajv2020 } from "ajv/dist/2020.js";
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });

export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected an array");
  return value;
}
export function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a string");
  return value;
}
export function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Expected a nonnegative safe integer");
  return value;
}
export function schemaErrors(schema: unknown, value: unknown): unknown[] {
  const validator = ajv.compile(object(schema));
  return validator(value) ? [] : [...(validator.errors ?? [])];
}

/** JSON stays valid YAML 1.2 while preserving response bytes after decoding. @example serialize({ status: "PASS" }) */
export function serialize(value: unknown, indent = 2): string {
  return (
    JSON.stringify(value, null, indent)
      .replace(/\u2013/g, "\\u2013")
      .replace(/\u2014/g, "\\u2014") + "\n"
  );
}
