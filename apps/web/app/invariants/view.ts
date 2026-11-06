// SPDX-License-Identifier: Apache-2.0
import type { Entry, Signal, Suite } from "../../../../packages/invariants/src/types";

export const suites: Suite[] = ["verifier", "indexer", "harness", "spec"];
export const labels: Record<Signal, string> = {
  OBSERVED: "Scoped match",
  MISMATCH: "Mismatch",
  NO_DATA: "No data",
  UNOBSERVABLE: "Not observable",
};
export type ReplayEvent = { suite: Suite; checks: number } | { done: true; evaluatedAt: string } | { error: string };

/** Use suite typography for display while keeping raw source text in downloads.
 * @example displayText("source\u2014text") // "source-text"
 */
export function displayText(text: string): string {
  return text.replace(/[\u2013\u2014]/g, "-");
}

/** Validate the small same-origin replay protocol. @example parseReplayEvent({suite:"spec",checks:1}) */
export function parseReplayEvent(value: unknown): ReplayEvent {
  if (!value || typeof value !== "object") throw new Error("Invalid replay event");
  const o = value as Record<string, unknown>;
  if (
    typeof o.suite === "string" &&
    suites.includes(o.suite as Suite) &&
    Number.isSafeInteger(o.checks) &&
    Number(o.checks) >= 0
  )
    return { suite: o.suite as Suite, checks: Number(o.checks) };
  if (o.done === true && typeof o.evaluatedAt === "string" && Number.isFinite(Date.parse(o.evaluatedAt)))
    return { done: true, evaluatedAt: o.evaluatedAt };
  if (typeof o.error === "string") return { error: o.error.slice(0, 200) };
  throw new Error("Invalid replay event");
}

/** Filter source rows without changing their evidence state. @example visibleEntries(rows, "M1", "ALL", "ALL") */
export function visibleEntries(entries: Entry[], query: string, signal: Signal | "ALL", kind: Entry["kind"] | "ALL") {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries.filter(
    (entry) =>
      (signal === "ALL" || entry.signal === signal) &&
      (kind === "ALL" || entry.kind === kind) &&
      words.every((word) =>
        `${entry.id} ${entry.title} ${entry.actor} ${entry.quote.text} ${entry.boundary}`.toLowerCase().includes(word),
      ),
  );
}
