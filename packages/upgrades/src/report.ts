// SPDX-License-Identifier: Apache-2.0
import { mergeTimeline, type Evidence, type Event, type Report } from "./model";
import type { Capture } from "./collect";
import { diffSpec } from "./spec";
import { docsHistory, npmHistory, pythonHistory } from "./releases";
import { runtimeHistory } from "./runtime";

/** Derive a timeline from recorded raw responses. Invalid sources become explicit gaps. @example buildReport(capture) */
export function buildReport(data: Capture, recorder?: { index: unknown; evidence: Evidence }): Report {
  const events: Event[] = [],
    gaps = [...data.gaps];
  for (let i = 1; i < data.revisions.length; i++) {
    try {
      events.push(...diffSpec(data.revisions[i - 1]!, data.revisions[i]!));
    } catch (error) {
      gaps.push({
        kind: "spec",
        source: `https://github.com/flop-labs/yellowpaper/commit/${data.revisions[i]!.commit.sha}`,
        measuredAt: Object.values(data.revisions[i]!.files)[0]!.measuredAt,
        reason: error instanceof Error ? error.message : "Invalid spec revision",
      });
    }
  }
  for (const raw of [...data.releases, ...data.docs]) {
    const kind = data.docs.includes(raw) ? "docs" : "sdk";
    try {
      const result =
        kind === "docs" ? docsHistory(raw) : raw.source.includes("pypi.org") ? pythonHistory(raw) : npmHistory(raw);
      events.push(...result.events);
      gaps.push(...result.gaps);
    } catch (error) {
      gaps.push({
        kind,
        source: raw.source,
        measuredAt: raw.measuredAt,
        reason: error instanceof Error ? error.message : "Invalid release metadata",
      });
    }
  }
  if (recorder) {
    const result = runtimeHistory(recorder.index, recorder.evidence);
    events.push(...result.events);
    gaps.push(...result.gaps);
  }
  return {
    events: mergeTimeline(events),
    gaps,
    recordings: data.raw.map(({ source, measuredAt }) => ({ source, measuredAt })),
  };
}
