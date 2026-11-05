// SPDX-License-Identifier: Apache-2.0
export type Kind = "block" | "transaction" | "account" | "channel" | "htlc";
export interface Evidence {
  label: string;
  source: string;
  tool: string;
  query: string | null;
  variables: Record<string, unknown>;
  measuredAt: string;
  state: "observed" | "unavailable";
  data: unknown;
  raw: string | null;
  error: string | null;
}
export interface Derived {
  label: string;
  value: string;
  formula: string;
  evidence: string[];
}
export interface Entity {
  kind: Kind;
  id: string;
  evidence: Evidence[];
  derived: Derived[];
  notes: string[];
  links: { label: string; input: string }[];
}
export interface Exploration {
  input: string;
  mode: "live" | "recorded";
  searchedAt: string;
  status: "found" | "not_found" | "unavailable" | "partial";
  entities: Entity[];
  lookups: Evidence[];
  requests: number;
  durationMs: number;
  cache: "miss" | "hit";
}
