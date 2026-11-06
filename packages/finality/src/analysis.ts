// SPDX-License-Identifier: Apache-2.0
import { RULES } from "./rules";
import { parseBlocks, parseFinality, parseRecording, type Finality, type Recording } from "./schema";

export type LagState = "unavailable" | "normal" | "warn" | "freeze" | "escape-eligible";
/** Evaluate the pinned Appendix A wording. Warn is strictly above its boundary. @example classifyLag(120) // "freeze" */
export function classifyLag(lag: number | null): LagState {
  if (lag === null) return "unavailable";
  if (!Number.isSafeInteger(lag) || lag < 0) throw new Error("Invalid lag");
  if (lag >= RULES.maxStallBlocks) return "escape-eligible";
  if (lag >= RULES.freezeBlocks) return "freeze";
  if (lag > RULES.warnBlocks) return "warn";
  return "normal";
}

/** Measure only linked consecutive blocks. No division across missing heights. @example analyzeRecording(recording).production */
export function analyzeRecording(input: Recording) {
  const recording = parseRecording(input);
  const value: unknown = JSON.parse(recording.raw);
  const blocks = parseBlocks(value);
  let finality: Finality | null = null;
  let finalityError: string | null = null;
  try {
    finality = parseFinality(value);
  } catch (e) {
    finalityError = e instanceof Error ? e.message : String(e);
  }
  const pairs = blocks.slice(1).map((block, i) => {
    const previous = blocks[i]!;
    const reason =
      block.number !== previous.number + 1
        ? "missing height"
        : block.parentHash !== previous.hash
          ? "parent mismatch"
          : block.timestamp === null || previous.timestamp === null
            ? "missing timestamp"
            : block.timestamp <= previous.timestamp
              ? "non-increasing timestamp"
              : block.timestamp > Date.parse(recording.measuredAt)
                ? "future timestamp"
                : null;
    return {
      from: previous.number,
      to: block.number,
      durationMs: reason ? null : block.timestamp! - previous.timestamp!,
      reason,
    };
  });
  const durations = pairs.flatMap((p) => (p.durationMs === null ? [] : [p.durationMs])).sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const medianMs = !durations.length
    ? null
    : durations.length % 2
      ? durations[mid]!
      : (durations[mid - 1]! + durations[mid]!) / 2;
  const lag = finality?.finalizedLag ?? null;
  const tipTimestamp = blocks.at(-1)?.timestamp;
  const indexedTipAgeMs =
    tipTimestamp == null || tipTimestamp > Date.parse(recording.measuredAt)
      ? null
      : Date.parse(recording.measuredAt) - tipTimestamp;
  const thresholdsMatch =
    finality === null
      ? null
      : Object.entries(finality.thresholds).every(
          ([key, value]) => value === RULES[key as keyof typeof finality.thresholds],
        );
  return {
    recording,
    blocks,
    pairs,
    indexedTipAgeMs,
    production: {
      intervals: durations.length,
      excluded: pairs.length - durations.length,
      medianMs,
      minMs: durations[0] ?? null,
      maxMs: durations.at(-1) ?? null,
      aboveTarget: durations.filter((d) => d > RULES.blockMs).length,
    },
    finality,
    finalityError,
    lag,
    lagState: classifyLag(lag),
    thresholdsMatch,
  };
}
export type Report = ReturnType<typeof analyzeRecording>;
