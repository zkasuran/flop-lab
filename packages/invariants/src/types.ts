// SPDX-License-Identifier: Apache-2.0
export type Suite = "verifier" | "indexer" | "harness" | "spec";
export type Signal = "OBSERVED" | "MISMATCH" | "NO_DATA" | "UNOBSERVABLE";
export interface Source {
  url: string;
  measuredAt: string;
  firstLine: number;
  raw: string;
}
export interface Quote {
  source: string;
  measuredAt: string;
  line: number;
  endLine: number;
  text: string;
}
export interface Rule {
  id: string;
  title: string;
  section: string;
  actor: string;
  kind: "invariant" | "policy" | "failure" | "penalty";
  quote: Quote;
  cells: { column: string; quote: string }[];
  flags: ("GAP" | "OOS" | "ASSUMED" | "REMOVED")[];
}
export interface Coverage {
  violation: string;
  boundary: string;
  checks: string[];
}
export interface Check {
  id: string;
  suite: Suite;
  status: "PASS" | "FAIL" | "UNVERIFIABLE";
  reason: string;
  evidence: { source: string; measuredAt: string; detail: string }[];
}
export interface Entry extends Rule, Coverage {
  signal: Signal;
  results: Check[];
}
export interface Report {
  version: 1;
  mode: "recorded";
  evaluatedAt: string;
  sources: Omit<Source, "raw">[];
  requests: 0;
  entries: Entry[];
  counts: Record<Signal, number>;
  warnings: string[];
}
