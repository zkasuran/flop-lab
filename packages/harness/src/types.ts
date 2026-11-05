// SPDX-License-Identifier: Apache-2.0
export type Risk = "read-only" | "spends-test-funds";
export type Status = "PASS" | "FAIL" | "UNVERIFIABLE" | "SKIPPED";
export interface Claim {
  id: string;
  title: string;
  source: { url: string; quote: string; path?: string; measuredAt: string };
  kind: "http" | "mcp" | "graphql" | "chain" | "sdk";
  risk: Risk;
  expected: string;
  check: string;
  tool?: string;
  args?: Record<string, unknown>;
  reason?: string;
  evidenceNeeded?: string;
}
export interface Evidence {
  id: number;
  measuredAt: string;
  durationMs: number;
  request: { url: string; method: string; headers: Record<string, string>; body?: string };
  status: number | null;
  response: string;
  responseTruncated?: boolean;
  rawFixture?: string;
  error?: string;
}
export interface Observation {
  status: Exclude<Status, "SKIPPED">;
  observed: unknown;
  reason: string;
}
export interface Attempt extends Observation {
  measuredAt: string;
  durationMs: number;
  evidence: number[];
}
export interface ClaimResult {
  claim: Claim;
  status: Status;
  flaky: boolean;
  reason: string;
  attempts: Attempt[];
  command: string;
}
export interface RunReport {
  version: 1;
  measuredAt: string;
  finishedAt: string;
  durationMs: number;
  source: string[];
  network: {
    name: string | null;
    genesisHash: string | null;
    specVersion: number | null;
    reason: string;
    evidence: number[];
  };
  budget: { maxRequests: number; requests: number; maxFlop: string; spentFlop: string; cacheTtlMs: number };
  results: ClaimResult[];
  evidence: Evidence[];
}
