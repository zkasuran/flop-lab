// SPDX-License-Identifier: Apache-2.0
export type Appendix = "A" | "G" | "H" | "V";
export type Result = "MATCH" | "DRIFT" | "SPEC_ONLY" | "RUNTIME_ONLY" | "UNOBSERVABLE";
export interface Evidence {
  source: string;
  measuredAt: string;
  quote: string;
  line?: number;
  sha?: string;
}
export interface Item {
  id: string;
  appendix: Appendix;
  section: string;
  kind: "parameter" | "call" | "status" | "vector";
  name: string;
  value: string;
  unit: string;
  evidence: Evidence;
  pallet?: string;
  arguments?: string[] | null;
  enforced?: boolean;
}
export interface SpecModel {
  sha: string;
  measuredAt: string;
  items: Item[];
  warnings: string[];
}
export interface Recording {
  source: string;
  measuredAt: string;
  raw: string;
  tool?: string;
  args?: Record<string, unknown>;
}
export interface RuntimeModel {
  parameters: Item[];
  calls: Item[];
  stats: Evidence | null;
  catalogAvailable: boolean;
  transactionCount: number;
  warnings: string[];
  measuredAt: string | null;
}
export interface Difference {
  id: string;
  appendix: Appendix;
  name: string;
  result: Result;
  spec: Item | null;
  runtime: Item | null;
  reason: string;
  needed: string | null;
}
export interface Report {
  sha: string;
  specMeasuredAt: string;
  lastCompared: string;
  runtimeMeasuredAt: string | null;
  mode: "recorded" | "live";
  counts: Record<Result, number>;
  differences: Difference[];
  warnings: string[];
  transactionCount: number;
  stats: Evidence | null;
}

/** Require an object at a data boundary. @example object(JSON.parse('{"ok":true}')) */
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}

/** Require text without coercing null or numbers. @example text("channel_id") */
export function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a string");
  return value;
}

/** Validate the evidence envelope before parsing its contents. @example parseRecording(snapshot) */
export function parseRecording(value: unknown): Recording {
  const o = object(value);
  const source = text(o.source);
  if (!source.startsWith("https://")) throw new Error("Evidence source must use HTTPS");
  const measuredAt = text(o.measuredAt);
  if (!Number.isFinite(Date.parse(measuredAt))) throw new Error("Invalid measurement time");
  const raw = text(o.raw);
  if (raw.length > 500_000) throw new Error("Evidence exceeds input limit");
  return {
    source,
    measuredAt,
    raw,
    ...(typeof o.tool === "string" ? { tool: o.tool } : {}),
    ...(o.args === undefined ? {} : { args: object(o.args) }),
  };
}
