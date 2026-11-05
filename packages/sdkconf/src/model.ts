// SPDX-License-Identifier: Apache-2.0
export const versions = { sdk: "0.4.0", client: "0.2.1", cli: "0.4.0", python: "0.2.0" } as const;
export type Sdk = keyof typeof versions;
export type Status = "PASS" | "FAIL" | "SKIPPED";
export interface Citation {
  source: string;
  lines: string;
  quote: string;
  basis: "documented" | "type contract" | "issue regression";
}
export interface Trace {
  sequence: number;
  atMs: number;
  method: string;
  url: string;
  body: string | null;
  headers: Record<string, string>;
  status: number | null;
  responseHeaders: Record<string, string>;
  outcome: string;
}
export interface Attempt {
  measuredAt: string;
  durationMs: number;
  passed: boolean;
  observed: string;
  trace: Trace[];
}
export interface Result {
  id: string;
  sdk: Sdk;
  version: string;
  behaviour: string;
  title: string;
  citation: Citation;
  expected: string;
  issue: number | null;
  status: Status;
  reason: string;
  attempts: Attempt[];
}
export interface Report {
  schema: "flop-sdkconf/v1";
  measuredAt: string;
  runtime: string;
  source: string;
  durationMs: number;
  networkRequests: 0;
  results: Result[];
}

/** Count observed outcomes without treating skips as passes. @example summarize(report.results).FAIL */
export function summarize(results: readonly Result[]): Record<Status, number> {
  return results.reduce(
    (counts, result) => {
      counts[result.status]++;
      return counts;
    },
    { PASS: 0, FAIL: 0, SKIPPED: 0 },
  );
}

/** Require every attempt to agree before claiming a confirmed failure. @example classify([false, false]) */
export function classify(outcomes: readonly boolean[]): Status {
  if (!outcomes.length) return "SKIPPED";
  if (outcomes.every(Boolean)) return "PASS";
  return outcomes.length >= 2 && outcomes.every((passed) => !passed) ? "FAIL" : "SKIPPED";
}

/** Validate saved reports at the file/worker boundary. @example parseReport(JSON.parse(text)) */
export function parseReport(value: unknown): Report {
  const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  const str = (v: unknown): v is string => typeof v === "string" && v.length <= 20000;
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const date = (v: unknown) => str(v) && Number.isFinite(Date.parse(v));
  const headers = (v: unknown) => object(v) && Object.values(v).every(str);
  const url = (v: unknown, trace = false) => {
    if (!str(v)) return false;
    try {
      const u = new URL(v);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        (!trace || ["gateway.sdkconf.invalid", "faucet.sdkconf.invalid", "mcp.sdkconf.invalid"].includes(u.hostname))
      );
    } catch {
      return false;
    }
  };
  if (
    !object(value) ||
    value.schema !== "flop-sdkconf/v1" ||
    !date(value.measuredAt) ||
    !str(value.runtime) ||
    !str(value.source) ||
    !num(value.durationMs) ||
    value.networkRequests !== 0 ||
    !Array.isArray(value.results) ||
    value.results.length > 200
  )
    throw new Error("Invalid SDK conformance report");
  const ids = new Set<string>();
  for (const r of value.results) {
    if (
      !object(r) ||
      !str(r.id) ||
      ids.has(r.id) ||
      !str(r.sdk) ||
      !Object.hasOwn(versions, r.sdk) ||
      r.version !== versions[r.sdk as Sdk] ||
      !str(r.title) ||
      !str(r.behaviour) ||
      !str(r.expected) ||
      !str(r.reason) ||
      !["PASS", "FAIL", "SKIPPED"].includes(String(r.status)) ||
      !(r.issue === null || (Number.isSafeInteger(r.issue) && Number(r.issue) > 0)) ||
      !object(r.citation) ||
      !url(r.citation.source) ||
      !str(r.citation.lines) ||
      !str(r.citation.quote) ||
      !["documented", "type contract", "issue regression"].includes(String(r.citation.basis)) ||
      !Array.isArray(r.attempts) ||
      r.attempts.length > 2
    )
      throw new Error("Invalid conformance result");
    ids.add(r.id);
    const outcomes: boolean[] = [];
    for (const a of r.attempts) {
      if (
        !object(a) ||
        !date(a.measuredAt) ||
        !num(a.durationMs) ||
        typeof a.passed !== "boolean" ||
        !str(a.observed) ||
        !Array.isArray(a.trace) ||
        a.trace.length > 100
      )
        throw new Error("Invalid attempt");
      outcomes.push(a.passed);
      for (const [index, t] of a.trace.entries()) {
        if (
          !object(t) ||
          t.sequence !== index + 1 ||
          !num(t.atMs) ||
          !str(t.method) ||
          !url(t.url, true) ||
          !(t.body === null || str(t.body)) ||
          !headers(t.headers) ||
          !headers(t.responseHeaders) ||
          !(t.status === null || (Number.isInteger(t.status) && Number(t.status) >= 100 && Number(t.status) <= 599)) ||
          !str(t.outcome)
        )
          throw new Error("Invalid request trace");
      }
    }
    if (classify(outcomes) !== r.status) throw new Error("Result contradicts its attempts");
  }
  return value as unknown as Report;
}
