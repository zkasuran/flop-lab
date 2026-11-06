// SPDX-License-Identifier: Apache-2.0
import { object, SERVICES, type ServiceId } from "./services";
export const OUTCOMES = ["pass", "http-error", "content-error", "network-error", "timeout", "body-too-large"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type Probe = {
  service: ServiceId;
  source: string;
  method: "GET" | "initialize";
  startedAt: string;
  measuredAt: string;
  latencyMs: number;
  httpStatus: number | null;
  outcome: Outcome;
  detail: string;
  bytes: number;
  retryAfterMs: number;
};
export type Run = {
  version: 1;
  observer: string;
  startedAt: string;
  finishedAt: string;
  timeoutMs: number;
  requests: number;
  probes: Probe[];
};
const iso = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Reject forged, incomplete or inconsistent archive rows before analysis. @example parseRun(JSON.parse(line)) */
export function parseRun(value: unknown): Run {
  if (
    !object(value) ||
    value.version !== 1 ||
    typeof value.observer !== "string" ||
    !/^[a-zA-Z0-9:/._-]{1,200}$/.test(value.observer) ||
    !iso(value.startedAt) ||
    !iso(value.finishedAt) ||
    value.finishedAt < value.startedAt ||
    !nonnegative(value.timeoutMs) ||
    value.timeoutMs < 1 ||
    value.timeoutMs > 30_000 ||
    value.requests !== SERVICES.length ||
    !Array.isArray(value.probes) ||
    value.probes.length !== SERVICES.length
  )
    throw new Error("Invalid status run");
  const seen = new Set<string>();
  for (const p of value.probes) {
    if (!object(p)) throw new Error("Invalid probe");
    const service = SERVICES.find((s) => s.id === p.service);
    if (
      !service ||
      seen.has(service.id) ||
      p.source !== service.url ||
      p.method !== service.method ||
      !iso(p.startedAt) ||
      !iso(p.measuredAt) ||
      p.startedAt < value.startedAt ||
      p.measuredAt < p.startedAt ||
      p.measuredAt > value.finishedAt ||
      !nonnegative(p.latencyMs) ||
      !Number.isSafeInteger(p.latencyMs) ||
      !nonnegative(p.bytes) ||
      !Number.isSafeInteger(p.bytes) ||
      p.bytes > 196_608 ||
      !nonnegative(p.retryAfterMs) ||
      p.retryAfterMs > 86_400_000 ||
      typeof p.detail !== "string" ||
      p.detail.length > 300 ||
      !OUTCOMES.includes(p.outcome as Outcome) ||
      (p.httpStatus !== null &&
        (!Number.isInteger(p.httpStatus) || Number(p.httpStatus) < 100 || Number(p.httpStatus) > 599))
    )
      throw new Error("Invalid probe fields");
    if ((p.outcome === "pass" || p.outcome === "content-error") && p.httpStatus !== 200)
      throw new Error("Content result requires HTTP 200");
    if (p.outcome === "pass" && p.bytes === 0) throw new Error("Passing probe needs content");
    if (p.outcome === "http-error" && (p.httpStatus === null || p.httpStatus === 200))
      throw new Error("Invalid HTTP failure");
    if (p.outcome === "network-error" && p.httpStatus !== null)
      throw new Error("Network failure cannot report HTTP status");
    seen.add(service.id);
  }
  return value as Run;
}

/** Validate bounded JSONL, ignoring blank lines only. @example parseHistory(await file.text()) */
export function parseHistory(text: string): Run[] {
  if (text.length > 2_000_000) throw new Error("History exceeds size limit");
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length > 256) throw new Error("History exceeds sample limit");
  return lines.map((line) => parseRun(JSON.parse(line)));
}
