// SPDX-License-Identifier: Apache-2.0
import type { Evidence, Observation } from "./types";
import { array, date, hash, height, object, text } from "./schema";

export const MAX_BUNDLE_BYTES = 1_000_000;

/** Stable JSON with sorted object keys. Example: canonical({b: 2, a: 1}). */
export function canonical(value: unknown, depth = 0): string {
  if (depth > 30) throw new Error("JSON nesting exceeds 30 levels");
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v, depth + 1)).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(object(value, "JSON"))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v, depth + 1)}`)
      .join(",")}}`;
  }
  throw new Error("Only finite JSON values can be hashed");
}

/** SHA-256 of UTF-8 text via Web Crypto. Example: await digest("hello"). */
export async function digest(value: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `0x${Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function withoutHash<T extends { sha256: string }>(value: T): Omit<T, "sha256"> {
  const { sha256: _hash, ...rest } = value;
  return rest;
}

/** Hash a raw observation. Example: await sealObservation({id: "head", ...metadata}). */
export async function sealObservation(value: Omit<Observation, "sha256">): Promise<Observation> {
  return { ...value, sha256: await digest(canonical(value)) };
}

/** Seal a portable bundle. Hashes detect changes, not the authenticity of its author.
 * @example await sealEvidence({version: 1, network: "flop-devnet", channelId, capturedAt, observations});
 */
export async function sealEvidence(value: Omit<Evidence, "sha256">): Promise<Evidence> {
  return { ...value, sha256: await digest(canonical(value)) };
}

/** Validate an untrusted bundle before checks. Example: parseEvidence(JSON.parse(file)). */
export function parseEvidence(value: unknown): Evidence {
  const serialized = canonical(value);
  if (new TextEncoder().encode(serialized).length > MAX_BUNDLE_BYTES) throw new Error("Bundle exceeds 1 MB");
  const o = object(value, "bundle");
  if ((o.version !== 1 && o.version !== 2) || o.network !== "flop-devnet")
    throw new Error("Unsupported bundle version or network");
  hash(o.channelId, "channelId");
  date(o.capturedAt, "capturedAt");
  hash(o.sha256, "sha256");
  const rows = array(o.observations, "observations");
  if (rows.length > 128) throw new Error("Too many observations");
  const ids = new Set<string>();
  for (const row of rows) {
    const r = object(row, "observation");
    const id = text(r.id, "observation.id");
    if (ids.has(id)) throw new Error(`Duplicate observation ${id}`);
    ids.add(id);
    text(r.source, `${id}.source`);
    text(r.tool, `${id}.tool`);
    object(r.args, `${id}.args`);
    date(r.measuredAt, `${id}.measuredAt`);
    if (Date.parse(String(r.measuredAt)) > Date.parse(String(o.capturedAt)))
      throw new Error(`${id} was measured after the bundle capture`);
    height(r.durationMs, `${id}.durationMs`);
    height(r.attempts, `${id}.attempts`);
    if (r.attempts === 0) throw new Error(`${id}.attempts must be positive`);
    if (r.raw !== null) text(r.raw, `${id}.raw`);
    if (r.error !== null) text(r.error, `${id}.error`);
    if ((r.raw === null) === (r.error === null)) throw new Error(`${id} needs exactly one of raw or error`);
    hash(r.sha256, `${id}.sha256`);
  }
  // All required fields have been checked above; raw payloads are checked per claim.
  return value as Evidence;
}

/** Return content hash mismatches. Example: await integrityErrors(parseEvidence(json)). */
export async function integrityErrors(bundle: Evidence): Promise<string[]> {
  const errors: string[] = [];
  for (const row of bundle.observations) {
    if ((await digest(canonical(withoutHash(row)))) !== row.sha256) errors.push(row.id);
  }
  if ((await digest(canonical(withoutHash(bundle)))) !== bundle.sha256) errors.push("bundle");
  return errors;
}
