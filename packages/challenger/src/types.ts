// SPDX-License-Identifier: Apache-2.0
import type { Settlement } from "@flop-lab/mcp";

export interface Observation<T> {
  value: T;
  source: string;
  measuredAt: string;
}

export interface BlockSample {
  number: number;
  timestamp: number;
  hash: string;
}

export interface Tape {
  settlements: Settlement[];
  source: string;
  startedAt: string;
  measuredAt: string;
  mode: "live" | "recorded";
  pages: { measuredAt: string; offset: number; count: number; total: number }[];
  rowMeasuredAt: Record<string, string>;
  coverage: { complete: boolean; reportedTotal: number; notes: string[] };
  blocks: Observation<BlockSample>[];
  warnings: string[];
  requests: number;
}

export interface WindowEstimate {
  status: "estimated-open" | "estimated-expired" | "unknown" | "no-standard-window";
  estimatedExpiry: string | null;
  remainingMs: number | null;
  reason: string;
}

export interface Signal {
  name: string;
  points: number | null;
  maximum: number;
  reason: string;
}

export interface Priority {
  score: number;
  maximum: 100;
  signals: Signal[];
  confidence: { availableSignals: number; totalSignals: number; tapeComplete: boolean; label: string };
  priorMinerSettlements: number;
  comparablePricePeers: number;
}

export interface ReviewRow {
  settlement: Settlement;
  window: WindowEstimate;
  priority: Priority;
  measuredAt: string;
  source: string;
}

export interface WatchReport {
  tape: Tape;
  evaluatedAt: string;
  assumptions: string[];
  blockCadence: { milliseconds: number; intervals: number; samples: Observation<BlockSample>[] } | null;
  rows: ReviewRow[];
}

export interface Check {
  name: string;
  status: "pass" | "fail" | "unverifiable";
  detail: string;
}

export interface Dossier {
  mode: "DRY RUN ONLY";
  channelId: string;
  createdAt: string;
  purpose: string;
  window: WindowEstimate;
  assumptions: string[];
  priority: Priority;
  bond: { documentedFlop: "100"; source: string; runtimeVerified: false; warning: string };
  eligibility: string;
  submission: {
    available: false;
    extrinsic: null;
    documentedCalls: { signature: string; lane: string; source: string; missingInputs: string[] }[];
    missing: string[];
  };
  checks: Check[];
  evidence: {
    settlement: Observation<Record<string, unknown>>;
    channel: Observation<Record<string, unknown>> | null;
    trustRoot: Observation<Record<string, unknown>> | null;
  };
}
