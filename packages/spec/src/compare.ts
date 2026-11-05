// SPDX-License-Identifier: Apache-2.0
import type { Difference, Item, Report, Result, RuntimeModel, SpecModel } from "./model";

// Ratios and durations use integer numerators. Blocks are never converted to wall-clock time.
const units: Record<string, [string, bigint]> = {
  percent: ["ratio-billionths", 10_000_000n],
  "%": ["ratio-billionths", 10_000_000n],
  "parts-per-thousand": ["ratio-billionths", 1_000_000n],
  ppt: ["ratio-billionths", 1_000_000n],
  ppm: ["ratio-billionths", 1000n],
  ppb: ["ratio-billionths", 1n],
  ms: ["milliseconds", 1n],
  s: ["milliseconds", 1000n],
  seconds: ["milliseconds", 1000n],
  minutes: ["milliseconds", 60_000n],
  hours: ["milliseconds", 3_600_000n],
  days: ["milliseconds", 86_400_000n],
  FLOP: ["FLOP-base-units", 1_000_000_000_000_000_000n],
  "base units": ["FLOP-base-units", 1n],
};

/** Normalise integers and fixed decimals exactly, with an explicit unit table. @example normalise("20", "percent") */
export function normalise(value: string, unit: string): { value: string; unit: string } {
  // Only grouping underscores between digits are removed. Unknown expressions remain exact strings.
  if (!/^-?\d+(?:_\d+)*(?:\.\d+)?$/.test(value)) return { value, unit };
  const compact = value.replaceAll("_", "");
  const [whole, fraction = ""] = compact.split(".");
  const scale = 10n ** BigInt(fraction.length);
  let numerator = BigInt(whole! + fraction);
  let denominator = scale;
  const mapping = units[unit];
  if (mapping) numerator *= mapping[1];
  const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));
  const divisor = gcd(numerator, denominator);
  numerator /= divisor;
  denominator /= divisor;
  return { value: denominator === 1n ? String(numerator) : `${numerator}/${denominator}`, unit: mapping?.[0] ?? unit };
}

function parameterPair(spec: Item, runtime: Item): { result: Result; reason: string } {
  // The paper joins value and unit into one cell. Prefer the catalog's exact suffix for nonnumeric text.
  const combined = spec.unit ? `${spec.value} ${spec.unit}` : spec.value;
  let left = { value: spec.value, unit: spec.unit };
  if (!spec.unit && runtime.unit && combined.endsWith(` ${runtime.unit}`))
    left = { value: combined.slice(0, -runtime.unit.length - 1), unit: runtime.unit };
  const a = normalise(left.value, left.unit);
  const b = normalise(runtime.value, runtime.unit);
  if (a.value === b.value && a.unit === b.unit)
    return {
      result: "MATCH",
      reason: "Exact value and unit agreement with the public catalog. This does not verify deployed storage.",
    };
  if (a.unit !== b.unit)
    return {
      result: "UNOBSERVABLE",
      reason: `Units are not comparable under the explicit normalisation table: ${a.unit || "unspecified"} versus ${b.unit || "unspecified"}.`,
    };
  return {
    result: "DRIFT",
    reason:
      "The pinned paper and public catalog give different values for the same exact identifier and unit. This is catalog drift, not proof of a runtime defect.",
  };
}

/** Compare one pinned specification to public evidence. @example compare(spec, runtime, {mode: "recorded", at: time}) */
export function compare(
  spec: SpecModel,
  runtime: RuntimeModel,
  options: { mode: "recorded" | "live"; at: string },
): Report {
  const differences: Difference[] = [];
  const remaining = new Map([...runtime.parameters, ...runtime.calls].map((item) => [item.id, item]));
  if (remaining.size !== runtime.parameters.length + runtime.calls.length)
    throw new Error("Duplicate runtime identifier");
  for (const item of spec.items) {
    const observed = remaining.get(item.id) ?? null;
    remaining.delete(item.id);
    let result: Result = "UNOBSERVABLE";
    let reason = "No independent public evidence establishes this implementation-status claim.";
    let needed: string | null = "Versioned runtime implementation and a conformance test for the cited clause.";
    if (item.kind === "parameter") {
      needed = "Pinned runtime metadata or storage at a finalized block, with the parameter identifier and unit.";
      if (observed) {
        ({ result, reason } = parameterPair(item, observed));
      } else if (runtime.catalogAvailable) {
        result = "SPEC_ONLY";
        reason =
          "The identifier is absent from the recorded catalog table. This does not establish absence from runtime storage.";
      } else reason = "The parameter catalog could not be read or validated.";
    } else if (item.kind === "call") {
      needed = "Runtime metadata with the pallet, exact call name and ordered argument names at a finalized block.";
      reason = observed
        ? "The exact call name was indexed, but positional values do not establish argument names or their full signature."
        : "The bounded transaction sample does not establish this call's signature or its absence.";
      if (observed && item.arguments === null && item.pallet) {
        result = "MATCH";
        reason = "Exact fully qualified call name observed. No argument signature is specified or verified.";
      }
    } else if (item.kind === "vector") {
      result = "SPEC_ONLY";
      reason =
        "Located a public vector or pending vector draft. Its quoted status and expectations are preserved. No runtime replay was performed.";
      needed = "A runtime adapter at a pinned version executing this vector and recording actual output.";
    }
    differences.push({
      id: item.id,
      appendix: item.appendix,
      name: item.name,
      result,
      spec: item,
      runtime: observed,
      reason,
      needed,
    });
  }
  for (const item of remaining.values())
    differences.push({
      id: item.id,
      appendix: item.appendix,
      name: item.name,
      result: "RUNTIME_ONLY",
      spec: null,
      runtime: item,
      reason:
        item.kind === "call"
          ? "This exact top-level indexed call name has no parsed Appendix G entry. Appendix G is not a complete runtime inventory."
          : "The catalog identifier has no parsed Appendix A row.",
      needed: "A spec entry or an explicit identifier mapping. Similar spellings are not a match.",
    });
  const counts: Report["counts"] = { MATCH: 0, DRIFT: 0, SPEC_ONLY: 0, RUNTIME_ONLY: 0, UNOBSERVABLE: 0 };
  for (const diff of differences) counts[diff.result]++;
  return {
    sha: spec.sha,
    specMeasuredAt: spec.measuredAt,
    lastCompared: options.at,
    runtimeMeasuredAt: runtime.measuredAt,
    mode: options.mode,
    differences,
    counts,
    warnings: [...spec.warnings, ...runtime.warnings],
    transactionCount: runtime.transactionCount,
    stats: runtime.stats,
  };
}
