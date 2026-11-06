// SPDX-License-Identifier: Apache-2.0
import { parseIndex } from "../../recorder/src/schema";
import { sourceUrl, time, type Event, type Gap, type Evidence } from "./model";

// Explicit fields prevent schema versions and gateway quote versions being called runtime upgrades.
const runtimeFields = [
  "health.runtimeVersion.specVersion",
  "health.specVersion",
  "stats.specVersion",
  "indexer.runtimeVersion.specVersion",
];
const sdkFields = ["health.sdkVersion", "health.sdk.version"];

/** Read explicit version points from a recorder index. Missing observations break continuity. @example runtimeHistory(index, evidence) */
export function runtimeHistory(raw: unknown, evidence: Evidence): { events: Event[]; gaps: Gap[] } {
  const index = parseIndex(raw),
    events: Event[] = [],
    gaps: Gap[] = [];
  sourceUrl(evidence.source);
  time(evidence.measuredAt);
  let runtimeSeen = false;
  const prior = new Map<string, { value: string; at: string; source: string; genesis: string | null }>();
  for (const entry of [...index.entries].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))) {
    const genesisPoint = entry.fields["indexer.block.hash"]?.value;
    const genesis = typeof genesisPoint === "string" ? genesisPoint : null;
    for (const field of [...runtimeFields, ...sdkFields]) {
      const point = entry.fields[field];
      if (!point || point.value === null) {
        prior.delete(field);
        continue;
      }
      const kind = runtimeFields.includes(field) ? "runtime" : "sdk";
      if (
        (typeof point.value !== "number" && typeof point.value !== "string") ||
        !/^[a-zA-Z0-9.+_-]{1,80}$/.test(String(point.value))
      )
        throw new Error("Invalid observed version");
      if (typeof point.value === "number" && !Number.isSafeInteger(point.value))
        throw new Error("Invalid numeric version");
      sourceUrl(point.source);
      const value = String(point.value),
        old = prior.get(field);
      if (old && (point.measuredAt < old.at || (point.measuredAt === old.at && value !== old.value)))
        throw new Error("Conflicting or reversed version observation time");
      const continuous = old && old.source === point.source && old.genesis !== null && old.genesis === genesis;
      if (kind === "runtime") runtimeSeen = true;
      if (!continuous || old.value !== value) {
        events.push({
          id: `recorder:${entry.id}:${field}`,
          kind,
          at: point.measuredAt,
          clock: "observed",
          source: point.source,
          measuredAt: point.measuredAt,
          title: `${field}: ${value}`,
          detail: continuous
            ? `Changed since the observation at ${old.at}. The upgrade time is unknown.`
            : "Observed baseline. Missing points, source changes or missing/different genesis break continuity.",
          changes: [{ name: field, before: continuous ? old.value : null, after: value }],
          links: [{ label: "Index reference", url: evidence.source }],
        });
      }
      prior.set(field, { value, at: point.measuredAt, source: point.source, genesis });
    }
  }
  if (!runtimeSeen)
    gaps.push({
      ...evidence,
      kind: "runtime",
      reason:
        "No explicit runtime specVersion in the supplied recorder index. Snapshot schema and quote versions are not runtime versions.",
    });
  return { events, gaps };
}
