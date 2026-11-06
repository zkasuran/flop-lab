// SPDX-License-Identifier: Apache-2.0
import {
  instant,
  parseComparison,
  parseDiscovery,
  parseGateway,
  parseInfo,
  parsePricing,
  parseProviders,
  parseRecording,
  parseTrust,
} from "./schema";
import type {
  Comparison,
  GatewayModel,
  ModelInfo,
  Observation,
  PriceSource,
  Pricing,
  RegistryModel,
  Status,
} from "./schema";

export type Check = { id: string; status: Status; reason: string; evidence: string[] };
export type Model = {
  id: string;
  name: string;
  gateway: GatewayModel | null;
  registry: RegistryModel | null;
  info: ModelInfo | null;
  pricing: Pricing | null;
  comparison: Comparison | null;
  checks: Check[];
};
export type Expiry = {
  state: "fresh" | "expired" | "not-yet-effective" | "invalid";
  remainingMs: number;
  fraction: number;
};

/** Fresh means effectiveAt <= at < expiresAt. @example expiry(source, recording.completedAt).state */
export function expiry(source: PriceSource, at: string): Expiry {
  const now = Date.parse(instant(at)),
    start = Date.parse(instant(source.effectiveAt)),
    end = Date.parse(instant(source.expiresAt));
  if (end <= start) return { state: "invalid", remainingMs: 0, fraction: 0 };
  if (now < start) return { state: "not-yet-effective", remainingMs: end - now, fraction: 0 };
  const remainingMs = Math.max(0, end - now);
  return { state: now < end ? "fresh" : "expired", remainingMs, fraction: remainingMs / (end - start) };
}

/** Join explicit registry names case-insensitively, then compare exact hashes. @example catalogue(recording).models */
export function catalogue(input: unknown) {
  const recording = parseRecording(input),
    errors: { key: string; reason: string }[] = [];
  function read<T>(key: string, parse: (v: unknown) => T): T | null {
    const observation = recording.observations.find((o) => o.key === key);
    try {
      if (!observation?.raw) throw new Error(observation?.error ?? "No observation");
      return parse(JSON.parse(observation.raw));
    } catch (error) {
      errors.push({ key, reason: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }
  const gateway = read("gateway", parseGateway),
    discovery = read("discover", parseDiscovery),
    trust = read("trust", parseTrust);
  const providers = read("providers", parseProviders),
    comparison = read("compare", parseComparison);
  const names = [
    ...new Set([
      ...(gateway ?? []).map((m) => m.registryName.toLowerCase()),
      ...(discovery?.models ?? []).map((m) => m.name.toLowerCase()),
    ]),
  ].sort();
  const gatewayRead = recording.observations.find((o) => o.key === "gateway")?.measuredAt ?? recording.completedAt;
  const models: Model[] = names.map((name) => {
    const g = gateway?.find((m) => m.registryName.toLowerCase() === name) ?? null;
    const r = discovery?.models.find((m) => m.name.toLowerCase() === name) ?? null;
    const id = g?.id ?? r?.hash ?? name;
    const infoKey = `info:${id}`,
      pricingKey = `pricing:${id}`;
    const info = read(infoKey, parseInfo),
      pricing = read(pricingKey, parsePricing);
    const checks: Check[] = [];
    checks.push({
      id: "registered",
      status: r ? "PASS" : discovery?.complete ? "FAIL" : "UNKNOWN",
      reason: r ? "Explicit registry name matches discovery." : "No matching entry in the observed registry response.",
      evidence: ["gateway", "discover"],
    });
    const matches =
      info &&
      r &&
      info.hash === r.hash &&
      info.name.toLowerCase() === name &&
      (g?.registryVersion == null || g.registryVersion === info.version);
    checks.push({
      id: "registry-details",
      status: !info || !r ? "UNKNOWN" : matches ? "PASS" : "FAIL",
      reason: "Compare model info name, hash and gateway registry version with discovery.",
      evidence: ["gateway", "discover", infoKey],
    });
    checks.push({
      id: "trust-hash",
      status: !r || !trust ? "UNKNOWN" : trust.hashes.includes(r.hash) ? "PASS" : "FAIL",
      reason: "Discovery model hash must occur in the observed trust root. No model bytes are hashed.",
      evidence: ["discover", "trust"],
    });
    const invalid = g?.sources.filter((s) => expiry(s, gatewayRead).state !== "fresh");
    checks.push({
      id: "fresh-at-read",
      status: !g?.sources.length ? "UNKNOWN" : invalid?.length ? "FAIL" : "PASS",
      reason: !g?.sources.length
        ? "No gateway price sources for this model."
        : `${invalid?.length ?? 0} of ${g.sources.length} source timestamps were not fresh at gateway read time.`,
      evidence: ["gateway"],
    });
    return {
      id,
      name: g?.registryName ?? r?.name ?? name,
      gateway: g,
      registry: r,
      info: matches ? info : null,
      pricing: pricing && r && pricing.hash === r.hash && pricing.name.toLowerCase() === name ? pricing : null,
      comparison: comparison?.find((c) => c.hash === r?.hash && c.name.toLowerCase() === name) ?? null,
      checks,
    };
  });
  const served = models.filter((m) => m.gateway);
  const gatewayNames = (gateway ?? []).map((m) => m.registryName.toLowerCase()).sort();
  const mcpNames = (discovery?.models ?? [])
    .filter((m) => m.served)
    .map((m) => m.name.toLowerCase())
    .sort();
  const canCompare =
    gateway !== null &&
    discovery?.complete &&
    discovery.availabilitySource === "gateway" &&
    discovery.models.every((m) => m.served !== null);
  const checks: Check[] = [
    {
      id: "served-registered",
      status:
        !gateway || !served.length || !discovery
          ? "UNKNOWN"
          : served.some((m) => m.checks[0]?.status === "FAIL")
            ? "FAIL"
            : served.every((m) => m.registry)
              ? "PASS"
              : "UNKNOWN",
      reason: "Every gateway-listed model must match an explicit discovery registry name.",
      evidence: ["gateway", "discover"],
    },
    {
      id: "prices-fresh",
      status:
        !gateway || !served.length
          ? "UNKNOWN"
          : served.some((m) => m.checks[3]?.status === "FAIL")
            ? "FAIL"
            : served.every((m) => m.checks[3]?.status === "PASS")
              ? "PASS"
              : "UNKNOWN",
      reason: "Every source needs effective_at <= gateway read time < expires_at. Missing sources are unknown.",
      evidence: ["gateway"],
    },
    {
      id: "served-list-agreement",
      status: !canCompare ? "UNKNOWN" : JSON.stringify(gatewayNames) === JSON.stringify(mcpNames) ? "PASS" : "FAIL",
      reason:
        "Compare gateway names with MCP entries explicitly marked served. Registry-only models are excluded. MCP availability uses the gateway, so agreement is not independent corroboration.",
      evidence: ["gateway", "discover"],
    },
  ];
  return { recording, gatewayRead, models, checks, providers, trust, errors };
}

export type Catalogue = ReturnType<typeof catalogue>;
/** Resolve check evidence with original times and URLs. @example evidenceFor(report, report.checks[0]) */
export function evidenceFor(report: Catalogue, check: Check): Observation[] {
  return report.recording.observations.filter((o) => check.evidence.includes(o.key));
}
