// SPDX-License-Identifier: Apache-2.0
import type { Snapshot } from "./types";

export function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected an object");
  return v as Record<string, unknown>;
}
export function text(v: unknown): string {
  if (typeof v !== "string" || v.length === 0 || v.length > 1000) throw new Error("Missing or invalid text field");
  return v;
}
export function integer(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new Error("Missing or unsafe integer field");
  return v;
}
export function amount(v: unknown): bigint {
  if (typeof v !== "string" || !/^\d{1,78}$/.test(v)) throw new Error("Missing or invalid exact amount");
  return BigInt(v);
}
export function rows(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v) || v.length > 100) throw new Error("Missing or oversized row list");
  return v.map(object);
}
export function flag(v: unknown): boolean {
  if (typeof v !== "boolean") throw new Error("Missing boolean field");
  return v;
}
function date(v: unknown): string {
  const value = text(v);
  if (!/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error("Invalid observation date");
  return value;
}
export function limitValue(v: unknown): number {
  const limit = integer(v);
  if (limit < 1 || limit > 100) throw new Error("Limit must be an integer from 1 to 100");
  return limit;
}

/** Validate a recorded envelope before using any of its observations.
 * @example const snapshot = parseSnapshot(JSON.parse(savedJson));
 */
export function parseSnapshot(input: unknown): Snapshot {
  const s = object(input);
  if (s.version !== 1 || !Array.isArray(s.observations) || s.observations.length > 110)
    throw new Error("Unsupported audit snapshot");
  const ids = new Set<string>();
  const observations = s.observations.map((v: unknown) => {
    const o = object(v);
    const id = text(o.id);
    if (ids.has(id)) throw new Error("Duplicate observation id");
    ids.add(id);
    const source = text(o.source);
    if (!/^https:\/\//.test(source)) throw new Error("Invalid observation source");
    if (o.raw !== null && (typeof o.raw !== "string" || o.raw.length > 200_000))
      throw new Error("Invalid raw response");
    return {
      id,
      source,
      measuredAt: date(o.measuredAt),
      request: object(o.request),
      raw: o.raw as string | null,
      ...(o.error === undefined ? {} : { error: text(o.error) }),
    };
  });
  return {
    version: 1,
    startedAt: date(s.startedAt),
    completedAt: date(s.completedAt),
    limit: limitValue(s.limit),
    requests: integer(s.requests),
    requestBudget: integer(s.requestBudget),
    durationMs: integer(s.durationMs),
    observations,
  };
}
