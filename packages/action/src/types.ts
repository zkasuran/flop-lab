// SPDX-License-Identifier: Apache-2.0
export const checkNames = ["tape", "spec", "contracts"] as const;
export type CheckName = (typeof checkNames)[number];
export type Status = "pass" | "fail" | "incomplete";
export interface Options {
  checks: CheckName[];
  mode: "recorded" | "live";
  maxRequests: number;
  failOnIncomplete: boolean;
}
export interface Source {
  url: string;
  measuredAt: string;
}
export interface CheckResult {
  name: CheckName;
  status: Status;
  pass: number;
  fail: number;
  incomplete: number;
  sources: Source[];
  details: string[];
}
export interface Report {
  version: 1;
  evaluatedAt: string;
  mode: Options["mode"];
  status: Status;
  exitCode: 0 | 1 | 2;
  requests: number;
  maxRequests: number;
  durationMs: number;
  checks: CheckResult[];
}
