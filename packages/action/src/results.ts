// SPDX-License-Identifier: Apache-2.0
import type { CheckName, CheckResult, Source, Status } from "./types";

/** Aggregate results without turning empty evidence into a pass. @example statusOf(['pass', 'incomplete']) */
export function statusOf(statuses: readonly Status[]): Status {
  if (statuses.includes("fail")) return "fail";
  if (!statuses.length || statuses.some((status) => status !== "pass")) return "incomplete";
  return "pass";
}

/** Build a counted result from package verdicts. @example result('tape', ['pass'], [], []) */
export function result(name: CheckName, statuses: Status[], sources: Source[], details: string[]): CheckResult {
  return {
    name,
    status: statusOf(statuses),
    pass: statuses.filter((status) => status === "pass").length,
    fail: statuses.filter((status) => status === "fail").length,
    incomplete: statuses.filter((status) => status === "incomplete").length,
    sources,
    details,
  };
}

/** Map verifier and audit states conservatively. @example verdict('UNVERIFIABLE') */
export function verdict(value: string): Status {
  if (["PASS", "MATCH", "NOT_APPLICABLE"].includes(value)) return "pass";
  if (["FAIL", "VIOLATION", "DRIFT"].includes(value)) return "fail";
  return "incomplete";
}
