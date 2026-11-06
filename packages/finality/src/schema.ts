// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_URL, parseIndexerData } from "@flop-lab/mcp";

export const QUERY = `query Finality {
  blocks(limit: 24, offset: 0) { hash parentHash number timestamp extrinsicsCount specVersion }
  stats { finality { bestBlock finalizedBlock finalizedLag state safeMode thresholds { warnBlocks freezeBlocks maxStallBlocks } } }
}`;
export type Block = { hash: string; parentHash: string | null; number: number; timestamp: number | null };
export type Finality = {
  bestBlock: number;
  finalizedBlock: number | null;
  finalizedLag: number | null;
  state: string;
  safeMode: boolean;
  thresholds: { warnBlocks: number; freezeBlocks: number; maxStallBlocks: number };
};
export type Recording = {
  version: 1;
  source: string;
  measuredAt: string;
  query: string;
  raw: string;
  requests: number;
  durationMs: number;
};

function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected object");
  return v as Record<string, unknown>;
}
function count(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new Error("Invalid nonnegative integer");
  return v;
}
function hash(v: string): string {
  if (!/^0x[\da-f]{64}$/i.test(v)) throw new Error("Invalid block hash");
  return v.toLowerCase();
}

/** Validate a bounded dated recording before replay. @example parseRecording(JSON.parse(text)) */
export function parseRecording(v: unknown): Recording {
  const o = object(v);
  if (o.version !== 1 || o.source !== DEFAULT_URL || o.query !== QUERY)
    throw new Error("Unknown recording source or query");
  if (
    typeof o.measuredAt !== "string" ||
    !Number.isFinite(Date.parse(o.measuredAt)) ||
    new Date(o.measuredAt).toISOString() !== o.measuredAt
  )
    throw new Error("Invalid observation time");
  if (typeof o.raw !== "string" || new TextEncoder().encode(o.raw).byteLength > 100_000)
    throw new Error("Invalid response size");
  return {
    version: 1,
    source: DEFAULT_URL,
    measuredAt: o.measuredAt,
    query: QUERY,
    raw: o.raw,
    requests: count(o.requests),
    durationMs: count(o.durationMs),
  };
}

/** Require full typed block rows and millisecond timestamps. @example parseBlocks({ blocks: [] }) */
export function parseBlocks(value: unknown): Block[] {
  const rows = parseIndexerData("blocks", value);
  if (rows.length > 24) throw new Error("Block window exceeds 24");
  const numbers = new Set<number>();
  const hashes = new Set<string>();
  return rows
    .map((b) => {
      const number = count(b.number);
      const normalized = hash(b.hash);
      if (numbers.has(number) || hashes.has(normalized)) throw new Error("Duplicate block height or hash");
      numbers.add(number);
      hashes.add(normalized);
      const timestamp = b.timestamp === null ? null : count(b.timestamp);
      if (timestamp !== null && timestamp > 8_640_000_000_000_000) throw new Error("Invalid timestamp");
      return { number, hash: normalized, parentHash: b.parentHash === null ? null : hash(b.parentHash), timestamp };
    })
    .sort((a, b) => a.number - b.number);
}

/** A reported lag must agree with the two heads in the same response. @example parseFinality(response) */
export function parseFinality(value: unknown): Finality | null {
  const stats = object(object(value).stats);
  if (stats.finality === null) return null;
  const f = object(stats.finality);
  const bestBlock = count(f.bestBlock);
  const finalizedBlock = f.finalizedBlock === null ? null : count(f.finalizedBlock);
  const finalizedLag = f.finalizedLag === null ? null : count(f.finalizedLag);
  if ((finalizedBlock === null) !== (finalizedLag === null)) throw new Error("Incomplete finalized heads");
  if (finalizedBlock !== null && (finalizedBlock > bestBlock || bestBlock - finalizedBlock !== finalizedLag))
    throw new Error("Inconsistent finalized lag");
  if (typeof f.state !== "string" || f.state.length > 80 || typeof f.safeMode !== "boolean")
    throw new Error("Invalid finality state");
  const t = object(f.thresholds);
  const thresholds = {
    warnBlocks: count(t.warnBlocks),
    freezeBlocks: count(t.freezeBlocks),
    maxStallBlocks: count(t.maxStallBlocks),
  };
  if (!(thresholds.warnBlocks < thresholds.freezeBlocks && thresholds.freezeBlocks < thresholds.maxStallBlocks))
    throw new Error("Unordered finality thresholds");
  return { bestBlock, finalizedBlock, finalizedLag, state: f.state, safeMode: f.safeMode, thresholds };
}
