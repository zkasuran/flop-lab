// SPDX-License-Identifier: Apache-2.0
export const GATEWAY = "https://api.flop.network/v1/models";
export const MCP = "https://mcp.flop.network/mcp";
export type Status = "PASS" | "FAIL" | "UNKNOWN";
export type Observation = {
  key: string;
  source: string;
  measuredAt: string;
  raw: string | null;
  error: string | null;
};
export type Recording = {
  version: 1;
  startedAt: string;
  completedAt: string;
  requests: number;
  durationMs: number;
  observations: Observation[];
};
export type PriceSource = { address: string; label: string; version: string; effectiveAt: string; expiresAt: string };
export type GatewayModel = {
  id: string;
  registryName: string;
  registryVersion: string | null;
  prompt: string | null;
  completion: string | null;
  sources: PriceSource[];
};
export type RegistryModel = {
  name: string;
  hash: string;
  served: boolean | null;
  miners: string[];
  pricePerGflop: number;
};
export type Discovery = { models: RegistryModel[]; complete: boolean; availabilitySource: string };
export type ModelInfo = { name: string; hash: string; version: string };
export type Pricing = { name: string; hash: string; pricePerGflop: number; gflopsPerToken: number };
export type Comparison = { name: string; hash: string; pricePerGflop: number; estimatedCost: string; tokens: number };

function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected an object");
  return v as Record<string, unknown>;
}
function text(v: unknown, max = 2000): string {
  if (typeof v !== "string" || !v.length || v.length > max) throw new Error("Invalid text");
  return v;
}
function array(v: unknown, max = 1000): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new Error("Invalid or oversized array");
  return v;
}
function number(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error("Invalid nonnegative number");
  return v;
}
function count(v: unknown): number {
  const n = number(v);
  if (!Number.isSafeInteger(n)) throw new Error("Invalid count");
  return n;
}
function decimal(v: unknown): string {
  const s = text(v, 100);
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Invalid decimal price");
  return s;
}
function hash(v: unknown): string {
  const h = text(v, 66);
  if (!/^0x[0-9a-f]{64}$/i.test(h)) throw new Error("Invalid model hash");
  return h.toLowerCase();
}
function address(v: unknown): string {
  const s = text(v, 50);
  if (!/^[1-9A-HJ-NP-Za-km-z]{46,50}$/.test(s)) throw new Error("Invalid address encoding");
  return s;
}
function unique<T>(rows: T[], key: (row: T) => string): T[] {
  if (new Set(rows.map(key)).size !== rows.length) throw new Error("Duplicate source identity");
  return rows;
}
/** Require a UTC instant. @example instant("2026-11-05T23:00:00.000Z") */
export function instant(v: unknown): string {
  const s = text(v, 24);
  if (!Number.isFinite(Date.parse(s)) || new Date(s).toISOString() !== s) throw new Error("Invalid UTC timestamp");
  return s;
}
/** Parse gateway entries without inventing per-address prices. @example parseGateway(JSON.parse(raw)) */
export function parseGateway(v: unknown): GatewayModel[] {
  const models = unique(
    array(object(v).data).map((item) => {
      const m = object(item),
        x = object(m["x-flop"]);
      const p = m.pricing == null ? null : object(m.pricing);
      return {
        id: text(m.id),
        registryName: text(x.registry_model),
        registryVersion: x.registry_version == null ? null : text(x.registry_version),
        prompt: p?.prompt == null ? null : decimal(p.prompt),
        completion: p?.completion == null ? null : decimal(p.completion),
        sources: unique(
          array(x.price_sources).map((item) => {
            const s = object(item);
            return {
              address: address(s.miner_address),
              label: text(s.source),
              version: text(s.version),
              effectiveAt: instant(s.effective_at),
              expiresAt: instant(s.expires_at),
            };
          }),
          (s) => s.address,
        ),
      };
    }),
    (m) => m.registryName.toLowerCase(),
  );
  return unique(models, (m) => m.id);
}
/** Validate the unfiltered registry response and detect truncation. @example parseDiscovery(value) */
export function parseDiscovery(v: unknown): Discovery {
  const d = object(v);
  const models = unique(
    array(d.models).map((item) => {
      const m = object(item);
      if (m.served != null && typeof m.served !== "boolean") throw new Error("Invalid served flag");
      return {
        name: text(m.modelName),
        hash: hash(m.modelHash),
        served: m.served == null ? null : (m.served as boolean),
        miners: unique(array(m.servingMiners ?? []).map(address), (s) => s),
        pricePerGflop: number(m.pricePerGflop),
      };
    }),
    (m) => m.name.toLowerCase(),
  );
  unique(models, (m) => m.hash);
  const total = count(d.totalMatches);
  if (total < models.length) throw new Error("Registry total is below returned count");
  return { models, complete: total === models.length, availabilitySource: text(d.availabilitySource ?? "unknown") };
}
/** Read only declared model hashes from the trust root. @example parseTrust(value) */
export function parseTrust(v: unknown): { snapshotHash: string; hashes: string[] } {
  const t = object(v);
  return {
    snapshotHash: hash(t.snapshotHash),
    hashes: unique(
      array(t.models).map((m) => hash(object(m).modelHash)),
      (s) => s,
    ),
  };
}
/** Validate the model details used by the join. @example parseInfo(value) */
export function parseInfo(v: unknown): ModelInfo {
  const m = object(v);
  return { name: text(m.modelName), hash: hash(m.modelHash), version: text(m.version) };
}
/** Validate declared MCP prices without using synthetic range or quality fields. @example parsePricing(value) */
export function parsePricing(v: unknown): Pricing {
  const p = object(v);
  return {
    name: text(p.modelName),
    hash: hash(p.modelHash),
    pricePerGflop: number(p.pricePerGflop),
    gflopsPerToken: number(p.gflopsPerToken),
  };
}
/** Keep comparison estimates labelled with their requested token count. @example parseComparison(value) */
export function parseComparison(v: unknown): Comparison[] {
  const c = object(v),
    tokens = count(c.tokensEstimate);
  return unique(
    array(c.comparison).map((item) => {
      const m = object(item);
      return {
        name: text(m.modelName),
        hash: hash(m.modelHash),
        pricePerGflop: number(m.pricePerGflop),
        estimatedCost: decimal(m.estimatedCost),
        tokens,
      };
    }),
    (m) => m.hash,
  );
}
/** Validate provider list count. Provider records remain uninterpreted. @example parseProviders(value) */
export function parseProviders(v: unknown): number {
  const p = object(v),
    rows = array(p.providers);
  rows.forEach(object);
  if (count(p.count) !== rows.length) throw new Error("Provider count mismatch");
  return rows.length;
}
/** Validate recorded evidence envelopes before evaluation. @example parseRecording(JSON.parse(raw)) */
export function parseRecording(v: unknown): Recording {
  const r = object(v);
  if (r.version !== 1) throw new Error("Unsupported recording version");
  const startedAt = instant(r.startedAt),
    completedAt = instant(r.completedAt);
  if (startedAt > completedAt) throw new Error("Reversed recording times");
  return {
    version: 1,
    startedAt,
    completedAt,
    requests: count(r.requests),
    durationMs: number(r.durationMs),
    observations: unique(
      array(r.observations, 50).map((item) => {
        const o = object(item),
          key = text(o.key, 500),
          source = text(o.source);
        if (source !== (key === "gateway" ? GATEWAY : MCP)) throw new Error("Unexpected source URL");
        const measuredAt = instant(o.measuredAt);
        if (measuredAt < startedAt || measuredAt > completedAt) throw new Error("Observation outside recording");
        const raw = o.raw === null ? null : text(o.raw, 190_000);
        const error = o.error === null ? null : text(o.error);
        if ((raw === null) === (error === null)) throw new Error("Observation needs data or error");
        return { key, source, measuredAt, raw, error };
      }),
      (o) => o.key,
    ),
  };
}
