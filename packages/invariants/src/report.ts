// SPDX-License-Identifier: Apache-2.0
import { coverageFor } from "./coverage";
import { parseSource } from "./parser";
import { recordedCatalogue, recordedInputs, recordedSources } from "./recorded";
import { runSuite, SUITES, type Inputs } from "./suites";
import type { Check, Entry, Report, Rule, Signal, Suite } from "./types";

/** Summarize scoped evidence without treating missing data as success.
 * @example signalFor([{ status: "FAIL" }], true) // "MISMATCH"
 */
export function signalFor(checks: readonly Pick<Check, "status">[], mapped: boolean): Signal {
  if (!mapped) return "UNOBSERVABLE";
  if (checks.some((c) => c.status === "FAIL")) return "MISMATCH";
  if (checks.some((c) => c.status === "PASS")) return "OBSERVED";
  return "NO_DATA";
}

/** Attach only reviewed checks. An observed check never verifies the whole source rule.
 * @example attachChecks(recordedCatalogue(), checks)
 */
export function attachChecks(rules: Rule[], checks: Check[]): Entry[] {
  return rules.map((rule) => {
    const coverage = coverageFor(rule);
    const results = coverage.checks.flatMap((id) => {
      const matched = checks.filter((c) => (id.endsWith("*") ? c.id.startsWith(id.slice(0, -1)) : c.id === id));
      if (matched.length) return matched;
      const suite = id.split(":")[0] as Suite;
      const failure = checks.find((c) => c.id === `${suite}:input`);
      return [
        {
          id,
          suite,
          status: "UNVERIFIABLE" as const,
          reason: failure?.reason ?? "The suite produced no matching check for this input.",
          evidence: [],
        },
      ];
    });
    return { ...rule, ...coverage, results, signal: signalFor(results, coverage.checks.length > 0) };
  });
}

/** Replay raw observations through the suite libraries. Callback fires after each completed library.
 * @example const report = await runChecks(recordedInputs());
 */
export async function runChecks(
  inputs: Inputs = recordedInputs(),
  onSuite?: (suite: Suite, checks: Check[]) => void,
): Promise<Report> {
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) throw new Error("Expected a suite input object");
  const checks: Check[] = [];
  for (const suite of SUITES) {
    const result = await runSuite(suite, inputs[suite]);
    checks.push(...result);
    onSuite?.(suite, result);
  }
  const entries = attachChecks(recordedCatalogue(), checks);
  const counts: Report["counts"] = { OBSERVED: 0, MISMATCH: 0, NO_DATA: 0, UNOBSERVABLE: 0 };
  for (const row of entries) counts[row.signal]++;
  return {
    version: 1,
    mode: "recorded",
    evaluatedAt: new Date().toISOString(),
    requests: 0,
    sources: recordedSources().map((value) => {
      const { raw: _raw, ...source } = parseSource(value);
      return source;
    }),
    entries,
    counts,
    warnings: [
      "OBSERVED means at least one scoped check matched. Other parts of the rule can remain unverified.",
      "MISMATCH means a scoped public-data or catalog disagreement, not a proven protocol violation.",
      "Raw recordings are dated, non-atomic and unsigned. Public views can share infrastructure.",
      "Replay re-evaluates recordings. It does not refresh the devnet or exercise failure scenarios.",
    ],
  };
}
