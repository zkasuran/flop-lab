// SPDX-License-Identifier: Apache-2.0
export type Status = "PASS" | "VIOLATION" | "UNVERIFIABLE" | "SKIPPED";
export interface Tool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
}
export interface Trace {
  id: number;
  source: string;
  measuredAt: string;
  durationMs: number;
  status: number;
  bytes: number;
  request: { jsonrpc: string; id: number; method: string; params?: { name: string; arguments: unknown } };
  raw: string;
  truncated: boolean;
}
export interface Finding {
  kind: "input" | "output" | "agreement" | "envelope";
  message: string;
  schemaPath: string;
  instancePath: string;
  value: unknown;
}
export interface Probe {
  label: "minimal" | "boundary" | "invalid";
  args: unknown;
}
export interface Observation {
  tool: string;
  probe: Probe;
  status: Status;
  reason: string;
  findings: Finding[];
  traceIds: number[];
  measuredAt: string | null;
  durationMs: number;
  bytes: number;
  confirmed: boolean;
}
export interface ToolResult {
  name: string;
  status: Status;
  outputSchema: boolean;
  reason: string;
  observations: Observation[];
}
export interface AuditReport {
  version: 1;
  source: string;
  measuredAt: string;
  finishedAt: string;
  durationMs: number;
  requests: number;
  maxRequests: number;
  spacingMs: number;
  cacheTtlMs: number;
  discoveryError: string | null;
  tools: ToolResult[];
  trust: TrustInspection;
}
export interface TrustInspection {
  version: unknown;
  snapshotHash: unknown;
  models: unknown;
  dstackVkeys: unknown;
  platforms: unknown;
  tcb: unknown;
  missing: string[];
  advisoryComparison: string[];
  sources: { url: string; measuredAt: string | null }[];
}
