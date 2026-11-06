// SPDX-License-Identifier: Apache-2.0
import { parseRun, type Probe, type Run } from "./schema";
import { SERVICES } from "./services";

export type Incident = {
  observer: string;
  firstFailure: string;
  lastFailure: string;
  failedSamples: number;
  recoveryObservedAt: string | null;
  endReason: "recovered" | "gap" | "end-of-window";
};
export type ServiceHistory = (typeof SERVICES)[number] & {
  samples: number;
  passed: number;
  availability: number | null;
  firstSample: string | null;
  lastSample: string | null;
  latest: Probe | null;
  points: Probe[];
  incidents: Incident[];
};
export const MAX_GAP_MS = 4.5 * 60 * 60 * 1000;

/** Deduplicate exact captures, rejecting conflicting copies instead of weighting them twice. @example uniqueRuns([run, run]) */
export function uniqueRuns(input: readonly Run[]): Run[] {
  const runs = new Map<string, Run>();
  for (const value of input) {
    const run = parseRun(value);
    const key = `${run.observer}|${run.startedAt}`;
    const existing = runs.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(run)) throw new Error("Conflicting status capture");
    runs.set(key, run);
  }
  return [...runs.values()].sort(
    (a, b) => a.startedAt.localeCompare(b.startedAt) || a.observer.localeCompare(b.observer),
  );
}

/** Compute equal-weight sample availability within inclusive UTC bounds. Gaps never prove continuous outages. @example analyzeHistory(runs, { from: "2026-11-06T00:00:00.000Z", to: "2026-11-07T00:00:00.000Z" }) */
export function analyzeHistory(input: readonly Run[], window: { from: string; to: string }): ServiceHistory[] {
  const from = Date.parse(window.from),
    to = Date.parse(window.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new Error("Invalid observation window");
  const runs = uniqueRuns(input);
  return SERVICES.map((service) => {
    const points = runs
      .flatMap((run) =>
        run.probes.filter(
          (p) => p.service === service.id && Date.parse(p.measuredAt) >= from && Date.parse(p.measuredAt) <= to,
        ),
      )
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const incidents: Incident[] = [];
    for (const observer of new Set(runs.map((run) => run.observer))) {
      const observerPoints = runs
        .filter((run) => run.observer === observer)
        .flatMap((run) =>
          run.probes.filter(
            (p) => p.service === service.id && Date.parse(p.measuredAt) >= from && Date.parse(p.measuredAt) <= to,
          ),
        )
        .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
      let incident: Incident | undefined;
      let previous: Probe | undefined;
      for (const point of observerPoints) {
        if (previous && Date.parse(point.measuredAt) - Date.parse(previous.measuredAt) > MAX_GAP_MS && incident) {
          incident.endReason = "gap";
          incident = undefined;
        }
        if (point.outcome !== "pass") {
          if (!incident) {
            incident = {
              observer,
              firstFailure: point.measuredAt,
              lastFailure: point.measuredAt,
              failedSamples: 0,
              recoveryObservedAt: null,
              endReason: "end-of-window",
            };
            incidents.push(incident);
          }
          incident.lastFailure = point.measuredAt;
          incident.failedSamples++;
        } else if (incident) {
          incident.recoveryObservedAt = point.measuredAt;
          incident.endReason = "recovered";
          incident = undefined;
        }
        previous = point;
      }
    }
    const passed = points.filter((p) => p.outcome === "pass").length;
    return {
      ...service,
      samples: points.length,
      passed,
      availability: points.length ? passed / points.length : null,
      firstSample: points[0]?.measuredAt ?? null,
      lastSample: points.at(-1)?.measuredAt ?? null,
      latest: points.at(-1) ?? null,
      points,
      incidents,
    };
  });
}
