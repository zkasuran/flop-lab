// SPDX-License-Identifier: Apache-2.0
export class Missing extends Error {}

export function object(value: unknown, name: string): Record<string, unknown> {
  if (value === undefined || value === null) throw new Missing(`${name} is missing`);
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

export function text(value: unknown, name: string): string {
  if (value === undefined || value === null) throw new Missing(`${name} is missing`);
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a nonempty string`);
  return value;
}

export function integer(value: unknown, name: string): bigint {
  const v = text(value, name);
  if (!/^(0|[1-9]\d{0,119})$/.test(v)) throw new Error(`${name} must be an unsigned decimal integer string`);
  return BigInt(v);
}

export function height(value: unknown, name: string): number {
  if (value === undefined || value === null) throw new Missing(`${name} is missing`);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`${name} must be a nonnegative safe integer`);
  return value;
}

export function boolean(value: unknown, name: string): boolean {
  if (value === undefined || value === null) throw new Missing(`${name} is missing`);
  if (typeof value !== "boolean") throw new Error(`${name} must be boolean`);
  return value;
}

export function hash(value: unknown, name: string): string {
  const v = text(value, name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`${name} must be a 32-byte hex hash`);
  return v.toLowerCase();
}

export function array(value: unknown, name: string): unknown[] {
  if (value === undefined || value === null) throw new Missing(`${name} is missing`);
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

export function date(value: unknown, name: string): string {
  const v = text(value, name);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)))
    throw new Error(`${name} must be an ISO UTC timestamp`);
  if (new Date(v).toISOString() !== v) throw new Error(`${name} is not a valid date`);
  return v;
}
