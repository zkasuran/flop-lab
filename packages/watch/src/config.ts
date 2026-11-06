// SPDX-License-Identifier: Apache-2.0
import { parseDocument, stringify } from "yaml";

export const kinds = [
  "devnet-reset",
  "settlement",
  "challenge-closing",
  "claim-change",
  "price-expired",
  "service-down",
] as const;
export type Kind = (typeof kinds)[number];
export type Rule = {
  id: string;
  kind: Kind;
  address?: string;
  withinBlocks?: number;
  claim?: string;
  report?: string;
  service?: "mcp" | "gateway";
  failures?: number;
};
export type Output = { kind: "stdout" | "jsonl" | "desktop" } | { kind: "webhook"; url: string };
export type Config = { version: 1; pollMs: number; maxRequests: number; rules: Rule[]; outputs: Output[] };

export function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected an object");
  return v as Record<string, unknown>;
}
export function text(v: unknown, max = 2000): string {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    [...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error("Invalid text");
  return v;
}
export function integer(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max)
    throw new Error(`Expected integer ${min} to ${max}`);
  return v;
}
export function time(v: unknown): string {
  const s = text(v, 24);
  if (!Number.isFinite(Date.parse(s)) || new Date(s).toISOString() !== s)
    throw new Error("Expected canonical UTC time");
  return s;
}
export function array(v: unknown, max = 20_000): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new Error("Invalid or oversized list");
  return v;
}
function fields(o: Record<string, unknown>, allowed: string[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new Error(`Unknown field: ${k}`);
}
function id(v: unknown) {
  const s = text(v, 100);
  if (!/^[a-z][a-z0-9-]*$/.test(s) || ["constructor", "prototype"].includes(s)) throw new Error("Invalid identifier");
  return s;
}
/** Validate a rule file. Unknown fields fail rather than silently disabling a rule. @example parseConfig(value) */
export function parseConfig(v: unknown): Config {
  const o = object(v);
  fields(o, ["version", "pollMs", "maxRequests", "rules", "outputs"]);
  if (o.version !== 1) throw new Error("Unsupported rule version");
  const seen = new Set<string>();
  const rules = array(o.rules, 50).map((v): Rule => {
    const r = object(v),
      kind = text(r.kind) as Kind;
    if (!kinds.includes(kind)) throw new Error("Unknown rule kind");
    const extras: Record<Kind, string[]> = {
      "devnet-reset": [],
      settlement: ["address"],
      "challenge-closing": ["withinBlocks"],
      "claim-change": ["claim", "report"],
      "price-expired": [],
      "service-down": ["service", "failures"],
    };
    fields(r, ["id", "kind", ...extras[kind]]);
    const rule: Rule = { id: id(r.id), kind };
    if (seen.has(rule.id)) throw new Error("Duplicate rule id");
    seen.add(rule.id);
    if (kind === "settlement") {
      rule.address = text(r.address, 50);
      if (!/^[1-9A-HJ-NP-Za-km-z]{46,50}$/.test(rule.address)) throw new Error("Expected address encoding shape");
    }
    if (kind === "challenge-closing") rule.withinBlocks = integer(r.withinBlocks, 1, 1_000_000);
    if (kind === "claim-change") {
      rule.claim = id(r.claim);
      rule.report = text(r.report);
    }
    if (kind === "service-down") {
      if (r.service !== "mcp" && r.service !== "gateway") throw new Error("Unknown public service");
      rule.service = r.service;
      rule.failures = integer(r.failures ?? 2, 1, 100);
    }
    return rule;
  });
  const outputs = array(o.outputs, 4).map((v): Output => {
    const out = object(v);
    fields(out, out.kind === "webhook" ? ["kind", "url"] : ["kind"]);
    if (out.kind === "webhook") {
      const url = new URL(text(out.url));
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash)
        throw new Error("Expected HTTP webhook URL without credentials or fragment");
      return { kind: "webhook", url: url.href };
    }
    if (out.kind !== "stdout" && out.kind !== "jsonl" && out.kind !== "desktop") throw new Error("Unknown output");
    return { kind: out.kind };
  });
  if (!rules.length || !outputs.length) throw new Error("At least one rule and output required");
  if (new Set(outputs.map((o) => o.kind)).size !== outputs.length) throw new Error("Duplicate output kind");
  return {
    version: 1,
    pollMs: integer(o.pollMs ?? 60_000, 10_000, 3_600_000),
    maxRequests: integer(o.maxRequests ?? 100, 1, 100_000),
    rules,
    outputs,
  };
}
/** Parse bounded YAML with aliases disabled. @example parseRules(yamlText) */
export function parseRules(raw: string): Config {
  if (raw.length > 64_000) throw new Error("Rule file exceeds limit");
  const doc = parseDocument(raw, { uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors[0]!.message);
  return parseConfig(doc.toJS({ maxAliasCount: 0 }));
}
/** Produce the same validated YAML consumed by the CLI. @example rulesYaml(config) */
export function rulesYaml(config: Config): string {
  return stringify(parseConfig(config));
}
export const example: Config = {
  version: 1,
  pollMs: 60_000,
  maxRequests: 100,
  rules: [
    { id: "reset", kind: "devnet-reset" },
    { id: "prices", kind: "price-expired" },
    { id: "availability", kind: "service-down", service: "mcp", failures: 2 },
  ],
  outputs: [{ kind: "jsonl" }],
};
