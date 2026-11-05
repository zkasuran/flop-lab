// SPDX-License-Identifier: Apache-2.0
export const MCP = "https://mcp.flop.network/mcp";
export const GATEWAY = "https://api.flop.network/v1/models";
export const MAX_SNAPSHOT_BYTES = 100_000;
export const MAX_INDEX_ENTRIES = 366;
export const keys = [
  "stats",
  "health",
  "models",
  "settlements",
  "poui",
  "trustRoot",
  "indexer",
  "networkValue",
  "harness",
] as const;
export type Key = (typeof keys)[number];
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Scalar = null | boolean | number | string;
export type Observation = {
  source: string;
  measuredAt: string;
  durationMs: number;
  status: "ok" | "unavailable";
  value: Json;
  error: string | null;
};
export type Snapshot = {
  version: 1;
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  requests: number;
  maxRequests: number;
  observations: Record<Key, Observation>;
};
export type Point = { value: Scalar; measuredAt: string; source: string };
export const statuses = ["PASS", "FAIL", "UNVERIFIABLE", "SKIPPED"] as const;
export type ClaimStatus = (typeof statuses)[number];
export type Claim = { id: string; status: ClaimStatus; measuredAt: string; source: string; reason: string };
export type Entry = { id: string; path: string; measuredAt: string; fields: Record<string, Point>; claims: Claim[] };
export type Index = { version: 1; entries: Entry[] };

/** Require a plain data object. @example object(JSON.parse(raw)) */
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}
/** Validate bounded text. @example text(value, 100) */
export function text(value: unknown, max = 2000): string {
  if (typeof value !== "string" || value.length > max || value.length === 0) throw new Error("Invalid text");
  return value;
}
/** Validate a finite nonnegative measurement. @example number(42) */
export function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid number");
  return value;
}
/** Validate a safe count. @example count(42) */
export function count(value: unknown): number {
  const result = number(value);
  if (!Number.isSafeInteger(result)) throw new Error("Invalid count");
  return result;
}
/** Require canonical UTC timestamps. @example time("2026-11-05T21:20:20.000Z") */
export function time(value: unknown): string {
  const result = text(value, 24);
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result)
    throw new Error("Invalid time");
  return result;
}
/** Validate a content digest. @example digest(snapshot.id) */
export function digest(value: unknown): string {
  const result = text(value, 64);
  if (!/^[a-f0-9]{64}$/.test(result)) throw new Error("Invalid digest");
  return result;
}
function array(value: unknown, max = 1000): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid array");
  return value;
}
function bool(value: unknown) {
  if (typeof value !== "boolean") throw new Error("Invalid boolean");
}
function hash(value: unknown) {
  if (!/^0x[\da-f]{64}$/i.test(text(value, 66))) throw new Error("Invalid chain hash");
}
function json(value: unknown, depth = 0): asserts value is Json {
  if (depth > 20) throw new Error("Data nesting limit exceeded");
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) json(item, depth + 1);
    return;
  }
  for (const [key, item] of Object.entries(object(value))) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Unsafe object key");
    json(item, depth + 1);
  }
}
const statsCounts = [
  "latestBlockNumber",
  "totalBlocks",
  "activeHTLCs",
  "totalHTLCs",
  "proofs24h",
  "activeOperators",
  "totalTransactions",
  "txVolume24h",
  "totalAccounts",
];

/** Validate each public source at the boundary. Null stats stay missing. @example validateValue("health", response) */
export function validateValue(key: Key, value: unknown): Json {
  json(value);
  const o = object(value);
  if (key === "stats" || key === "indexer") {
    const s = object(o.stats);
    for (const field of statsCounts) if (s[field] !== null) count(s[field]);
    for (const field of ["tps", "avgBlockTime"]) if (s[field] !== null) number(s[field]);
    if (s.flopLocked !== null && !/^\d+$/.test(text(s.flopLocked))) throw new Error("Invalid amount");
    if (key === "indexer" && o.block !== null) {
      const block = object(o.block);
      if (count(block.number) !== 0) throw new Error("Genesis query returned another block");
      hash(block.hash);
    }
  } else if (key === "health") {
    bool(o.connected);
    bool(o.syncing);
    count(o.peers);
    text(o.chain);
  } else if (key === "models") {
    for (const item of array(o.data)) {
      const model = object(item);
      text(model.id);
      for (const item of array(object(model["x-flop"]).price_sources)) {
        const source = object(item);
        if (!/^[1-9A-HJ-NP-Za-km-z]{46,50}$/.test(text(source.miner_address))) throw new Error("Invalid miner address");
        time(source.effective_at);
        time(source.expires_at);
        text(source.source);
        text(source.version);
      }
    }
  } else if (key === "settlements") {
    for (const item of array(o.data, 5)) {
      const row = object(item);
      hash(row.channelId);
      count(row.settledBlock);
      count(row.settledAt);
      for (const name of ["escrow", "minerPaid", "burned", "unusedEscrow"]) {
        if (!/^\d+$/.test(text(row[name]))) throw new Error("Invalid settlement amount");
      }
    }
    const p = object(o.pagination);
    count(p.total);
    count(p.limit);
    count(p.offset);
    bool(p.hasMore);
  } else if (key === "poui") {
    // Rows are preserved as JSON. Only their count is interpreted by this recorder.
    for (const item of array(o.pouiLeaderboard, 5)) object(item);
  } else if (key === "trustRoot") {
    digest(o.digest);
    hash(o.snapshotHash);
    count(o.dstackVkeys);
    count(o.models);
    count(o.committee);
  } else if (key === "networkValue") {
    const v = object(o.networkValue);
    for (const field of ["contributors", "models"]) count(v[field]);
    for (const field of ["effectiveCoalitions", "concentration", "effectiveAgents"]) number(v[field]);
  } else {
    count(o.requests);
    count(o.maxRequests);
    if (count(o.requests) > count(o.maxRequests)) throw new Error("Harness budget exceeded");
    const seen = new Set<string>();
    for (const item of array(o.claims, 8)) {
      const claim = parseClaim(item);
      if (seen.has(claim.id)) throw new Error("Duplicate claim");
      seen.add(claim.id);
    }
  }
  return value;
}

/** Parse a claim summary. @example parseClaim(report.results[0]) */
export function parseClaim(value: unknown): Claim {
  const c = object(value);
  if (!statuses.includes(c.status as ClaimStatus)) throw new Error("Invalid claim status");
  return {
    id: text(c.id, 100),
    status: c.status as ClaimStatus,
    measuredAt: time(c.measuredAt),
    source: text(c.source),
    reason: text(c.reason),
  };
}

/** Stable JSON with recursively sorted keys. Arrays retain order. @example canonical({ b: 2, a: 1 }) */
export function canonical(value: unknown): string {
  json(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/** SHA-256 of canonical JSON, not a signature. @example await contentHash({ version: 1 }) */
export async function contentHash(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Seal a snapshot and enforce its byte ceiling. @example await seal(payload) */
export async function seal(payload: Omit<Snapshot, "id">): Promise<Snapshot> {
  const snapshot = { ...payload, id: await contentHash(payload) };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength >= MAX_SNAPSHOT_BYTES)
    throw new Error("Snapshot exceeds 100 KB");
  return snapshot;
}

/** Validate stored snapshots and detect changed bytes. @example await parseSnapshot(JSON.parse(raw)) */
export async function parseSnapshot(value: unknown): Promise<Snapshot> {
  const s = object(value);
  if (s.version !== 1) throw new Error("Unsupported snapshot version");
  const observations = {} as Record<Key, Observation>;
  const input = object(s.observations);
  for (const key of keys) {
    const o = object(input[key]);
    if (o.status !== "ok" && o.status !== "unavailable") throw new Error("Invalid source status");
    if (o.status === "unavailable" && o.value !== null) throw new Error("Unavailable source has data");
    observations[key] = {
      source: text(o.source),
      measuredAt: time(o.measuredAt),
      durationMs: count(o.durationMs),
      status: o.status,
      value: o.status === "ok" ? validateValue(key, o.value) : null,
      error: o.status === "ok" ? null : text(o.error),
    };
    if (o.status === "ok" && o.error !== null) throw new Error("Successful source has an error");
  }
  const payload = {
    version: 1 as const,
    startedAt: time(s.startedAt),
    finishedAt: time(s.finishedAt),
    durationMs: count(s.durationMs),
    requests: count(s.requests),
    maxRequests: count(s.maxRequests),
    observations,
  };
  if (payload.requests > payload.maxRequests || payload.startedAt > payload.finishedAt)
    throw new Error("Invalid run bounds");
  for (const o of Object.values(observations))
    if (o.measuredAt < payload.startedAt || o.measuredAt > payload.finishedAt)
      throw new Error("Observation outside run");
  const sealed = await seal(payload);
  if (sealed.id !== digest(s.id) || canonical(sealed) !== canonical(value))
    throw new Error("Snapshot content hash mismatch");
  return sealed;
}

/** Deterministic archive path with a collision-resistant name. @example snapshotPath(snapshot) */
export function snapshotPath(snapshot: Pick<Snapshot, "startedAt" | "id">): string {
  return `snapshots/${snapshot.startedAt.slice(0, 10).replaceAll("-", "/")}/${snapshot.startedAt.slice(11).replaceAll(":", "-")}-${snapshot.id}.json`;
}

/** Validate the rolling public index before using any paths or numbers. @example parseIndex(JSON.parse(raw)) */
export function parseIndex(value: unknown): Index {
  const o = object(value);
  if (o.version !== 1) throw new Error("Unsupported index version");
  const seen = new Set<string>();
  const entries = array(o.entries, MAX_INDEX_ENTRIES).map((item): Entry => {
    const e = object(item);
    const id = digest(e.id),
      measuredAt = time(e.measuredAt);
    if (seen.has(id)) throw new Error("Duplicate snapshot");
    seen.add(id);
    if (e.path !== snapshotPath({ id, startedAt: measuredAt })) throw new Error("Invalid snapshot path");
    const fields: Record<string, Point> = {};
    for (const [key, value] of Object.entries(object(e.fields))) {
      if (!/^[a-zA-Z][a-zA-Z0-9.]{0,100}$/.test(key)) throw new Error("Invalid field name");
      const p = object(value);
      if (p.value !== null && !["number", "boolean", "string"].includes(typeof p.value))
        throw new Error("Invalid point");
      if (typeof p.value === "number") number(p.value);
      if (typeof p.value === "string") text(p.value);
      if (
        /^(stats\.(latestBlockNumber|totalAccounts)|indexer\.stats\.(latestBlockNumber|totalAccounts)|models\.(count|miners))$/.test(
          key,
        ) &&
        p.value !== null
      )
        count(p.value);
      if (key === "indexer.block.hash" && p.value !== null) hash(p.value);
      fields[key] = { value: p.value as Scalar, measuredAt: time(p.measuredAt), source: text(p.source) };
    }
    if (Object.keys(fields).length > 100) throw new Error("Too many fields");
    const claims = array(e.claims, 8).map(parseClaim);
    if (new Set(claims.map((c) => c.id)).size !== claims.length) throw new Error("Duplicate claim");
    return { id, path: e.path as string, measuredAt, fields, claims };
  });
  if (entries.some((entry, i) => i > 0 && entry.measuredAt <= entries[i - 1]!.measuredAt))
    throw new Error("Index must be chronological with unique run times");
  return { version: 1, entries };
}
