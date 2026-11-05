// SPDX-License-Identifier: Apache-2.0
export type Status = "PASS" | "FAIL" | "UNVERIFIABLE";
export interface Observation {
  id: string;
  source: string;
  measuredAt: string;
  request: Record<string, unknown>;
  raw: string | null;
  error?: string;
}
export interface Snapshot {
  version: 1;
  startedAt: string;
  completedAt: string;
  limit: number;
  requests: number;
  requestBudget: number;
  durationMs: number;
  observations: Observation[];
}
export interface Evidence {
  label: string;
  value: string;
  observationIds: string[];
}
export interface Finding {
  id: string;
  title: string;
  status: Status;
  reason: string;
  formula: string;
  reference: string;
  left: Evidence;
  right: Evidence;
}
export interface AuditReport {
  snapshot: Snapshot;
  findings: Finding[];
  counts: Record<Status, number>;
  cached: boolean;
}
