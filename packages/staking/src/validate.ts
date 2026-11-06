// SPDX-License-Identifier: Apache-2.0
export function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected object");
  return v as Record<string, unknown>;
}
export function text(v: unknown): string {
  if (typeof v !== "string" || !v || v.length > 200_000) throw new Error("Expected nonempty string");
  return v;
}
export function rawAmount(v: unknown): bigint {
  if (typeof v !== "string" || !/^(0|[1-9]\d{0,38})$/.test(v) || BigInt(v) >= 1n << 128n)
    throw new Error("Invalid base-unit amount");
  return BigInt(v);
}
export function integer(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new Error("Expected nonnegative safe integer");
  return v;
}
export function list(v: unknown): unknown[] {
  if (!Array.isArray(v) || v.length > 100) throw new Error("Expected at most 100 rows");
  return v;
}
export interface Observation {
  source: string;
  measuredAt: string;
  raw: string | null;
  error?: string;
}
export function observation(v: unknown): Observation {
  const o = object(v),
    source = text(o.source),
    measuredAt = text(o.measuredAt);
  if (
    !source.startsWith("https://") ||
    !/^\d{4}-\d\d-\d\dT/.test(measuredAt) ||
    !Number.isFinite(Date.parse(measuredAt))
  )
    throw new Error("Invalid provenance");
  return {
    source,
    measuredAt,
    raw: o.raw === null ? null : text(o.raw),
    ...(o.error === undefined ? {} : { error: text(o.error) }),
  };
}
