// SPDX-License-Identifier: Apache-2.0
export type Status = "PASS" | "FAIL" | "UNVERIFIABLE" | "NOT_APPLICABLE";

export interface Check {
  id: string;
  claim: string;
  status: Status;
  detail: string;
  inputs: Record<string, unknown>;
  evidence: string[];
}

export interface Observation {
  id: string;
  source: string;
  tool: string;
  args: Record<string, unknown>;
  measuredAt: string;
  durationMs: number;
  attempts: number;
  /** Exact MCP tool text. The transport envelope is handled by @flop-lab/mcp. */
  raw: string | null;
  error: string | null;
  sha256: string;
}

export interface Evidence {
  version: 1;
  network: "flop-devnet";
  channelId: string;
  capturedAt: string;
  observations: Observation[];
  sha256: string;
}

export interface Report {
  channelId: string;
  capturedAt: string | null;
  checks: Check[];
  exitCode: 0 | 1 | 3;
}
