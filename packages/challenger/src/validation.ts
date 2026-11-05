// SPDX-License-Identifier: Apache-2.0
import { parseSettlement, type Settlement } from "../../mcp/src/index";
import type { BlockSample } from "./types";

export function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name}: expected object`);
  return value as Record<string, unknown>;
}

export function integer(value: unknown, name: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
    throw new Error(`${name}: expected safe integer >= ${minimum}`);
  return value;
}

export function timestamp(value: unknown, name: string): number {
  const n = integer(value, name, 1);
  if (n > 8_640_000_000_000_000 - 604_800_000) throw new Error(`${name}: timestamp out of range`);
  return n;
}

export function text(value: unknown, name: string): string {
  // Reject terminal escape sequences and control characters from public data.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || /[\x00-\x1f\x7f]/.test(value))
    throw new Error(`${name}: expected nonempty text without control characters`);
  return value;
}

export function decimal(value: string): { n: bigint; d: bigint } {
  if (!/^\d{1,100}(?:\.\d{1,100})?$/.test(value)) throw new Error("pricePerGflop: invalid decimal");
  const [whole, fraction = ""] = value.split(".");
  return { n: BigInt(`${whole}${fraction}`), d: 10n ** BigInt(fraction.length) };
}

export function settlement(value: unknown): Settlement {
  const s = parseSettlement(value);
  timestamp(s.settledAt, "settledAt");
  integer(s.settledBlock, "settledBlock");
  for (const key of ["channelId", "agent", "miner", "settlementKind", "settlementEvent", "marketKind"] as const)
    text(s[key], key);
  for (const key of ["modelHash", "assuranceTier", "gpuSku", "settledBlockHash", "extrinsicHash"] as const) {
    const raw = object(value, "settlement")[key];
    if (raw !== null && raw !== undefined) text(raw, key);
  }
  for (const key of ["escrow", "minerPaid", "burned", "unusedEscrow", "aggregateGn"] as const)
    if (s[key].length > 100) throw new Error(`${key}: integer too long`);
  decimal(s.pricePerGflop);
  return s;
}

export function block(value: unknown): BlockSample {
  const b = object(object(value, "block response").block, "block");
  return {
    number: integer(b.number, "block.number"),
    timestamp: timestamp(b.timestamp, "block.timestamp"),
    hash: text(b.hash, "block.hash"),
  };
}

export function channel(value: unknown): Record<string, unknown> {
  const c = object(value, "channel");
  text(c.channelId, "channel.channelId");
  for (const key of ["agent", "miner", "observationHead", "evidenceStatus", "paymentStatus"])
    if (c[key] !== undefined && c[key] !== null) text(c[key], `channel.${key}`);
  for (const key of ["escrow", "minerPaid", "burned", "aggregateGn"])
    if (c[key] !== undefined && (typeof c[key] !== "string" || !/^\d{1,100}$/.test(c[key])))
      throw new Error(`channel.${key}: expected integer string`);
  if (c.settlement !== undefined && c.settlement !== null) {
    const s = object(c.settlement, "channel.settlement");
    integer(s.blockNumber, "channel.settlement.blockNumber");
    if (s.blockHash !== undefined && s.blockHash !== null) text(s.blockHash, "channel.settlement.blockHash");
  }
  return c;
}
