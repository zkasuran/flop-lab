// SPDX-License-Identifier: Apache-2.0
export type Role = "miner" | "validator";
export type Status = "READY" | "NOT_READY" | "UNKNOWN";
export interface Source {
  url: string;
  quote: string;
  locator: string;
}
export interface Evidence<T> {
  source: string;
  measuredAt: string;
  durationMs: number;
  value: T | null;
  reason: string | null;
}
export interface Gpu {
  name: string;
  totalBytes: number;
  freeBytes: number;
}
export interface Disk {
  totalBytes: number;
  availableBytes: number;
}
export interface Memory {
  totalBytes: number;
  availableBytes: number;
}
export interface ClockSample {
  date: string;
  age: string | null;
  startMs: number;
  endMs: number;
  elapsedMs: number;
}
export interface Inventory {
  os: Evidence<{ platform: string; arch: string }>;
  gpu: Evidence<Gpu[]>;
  disk: Evidence<Disk>;
  memory: Evidence<Memory>;
  cpu: Evidence<number>;
  docker: Evidence<string>;
  compose: Evidence<string>;
  images: Record<string, Evidence<{ pinned: boolean; digestPresent: boolean }>>;
  ports: Evidence<{ port: number; bound: boolean }>[];
  clocks: Evidence<ClockSample>[];
  models: Evidence<string[]>;
}
export interface Requirement {
  id: string;
  title: string;
  status: Status;
  detail: string;
  source: Source;
  evidence: Evidence<unknown>[];
}
export interface Report {
  schemaVersion: 1;
  role: Role;
  measuredAt: string;
  status: Status;
  requirements: Requirement[];
  inventory: Inventory;
  host?: string;
  requests: number;
  durationMs: number;
}
