// SPDX-License-Identifier: Apache-2.0
export type Kind = "spec" | "sdk" | "runtime" | "docs";
export type Evidence = { source: string; measuredAt: string };
export type Recording = Evidence & { status: number; body: string; lastModified: string | null };
export type Change = { name: string; before: string | null; after: string | null };
export type Event = Evidence & {
  id: string;
  kind: Kind;
  at: string;
  clock: "commit" | "published" | "observed" | "last-modified" | "page-date";
  title: string;
  detail: string;
  changes: Change[];
  links: { label: string; url: string }[];
};
export type Gap = Evidence & { kind: Kind; reason: string };
export type Report = { events: Event[]; gaps: Gap[]; recordings: Evidence[] };
export const kinds: Kind[] = ["spec", "sdk", "runtime", "docs"];

/** Reject non-object input. @example object(JSON.parse(raw)) */
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object");
  return value as Record<string, unknown>;
}
/** Read bounded text without coercion. @example text(row.version) */
export function text(value: unknown, max = 2000): string {
  if (typeof value !== "string" || !value.length || value.length > max) throw new Error("Invalid text");
  return value;
}
/** Require an unambiguous ISO timestamp. @example time("2026-11-05T00:00:00Z") */
export function time(value: unknown): string {
  const result = text(value, 40);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(result) || !Number.isFinite(Date.parse(result)))
    throw new Error("Invalid UTC timestamp");
  const normalized = new Date(result).toISOString();
  if (normalized.slice(0, 19) !== result.slice(0, 19)) throw new Error("Invalid calendar date");
  return normalized;
}
/** Accept public HTTPS source links only. @example sourceUrl(recording.source) */
export function sourceUrl(value: unknown): string {
  const result = text(value);
  const url = new URL(result);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid source URL");
  return result;
}
/** Validate a raw recorded network boundary before interpretation. @example recording(raw) */
export function recording(value: unknown): Recording {
  const r = object(value);
  if (!Number.isInteger(r.status) || Number(r.status) < 100 || Number(r.status) > 599)
    throw new Error("Invalid HTTP status");
  if (typeof r.body !== "string" || r.body.length > 4_000_000) throw new Error("Invalid response body");
  return {
    source: sourceUrl(r.source),
    measuredAt: time(r.measuredAt),
    status: Number(r.status),
    body: r.body,
    lastModified: r.lastModified === null ? null : text(r.lastModified),
  };
}
/** Validate a full immutable git revision. @example sha(commit.sha) */
export function sha(value: unknown): string {
  const result = text(value, 40);
  if (!/^[a-f0-9]{40}$/.test(result)) throw new Error("Expected full commit SHA");
  return result;
}
/** Keep source and reception time without leaking raw bodies into summaries. @example evidence(raw) */
export function evidence(value: Evidence): Evidence {
  return { source: sourceUrl(value.source), measuredAt: time(value.measuredAt) };
}
/** Filter without changing the source report. @example filterEvents(report.events, "spec", "stake") */
export function filterEvents(events: readonly Event[], kind: Kind | "all" = "all", query = ""): Event[] {
  const needle = query.trim().toLowerCase();
  return events.filter(
    (event) =>
      (kind === "all" || event.kind === kind) &&
      `${event.title} ${event.detail} ${event.changes.map((c) => `${c.name} ${c.before ?? ""} ${c.after ?? ""}`).join(" ")}`
        .toLowerCase()
        .includes(needle),
  );
}
/** Sort independent evidence clocks without equating them. @example mergeTimeline(spec, releases) */
export function mergeTimeline(...groups: Event[][]): Event[] {
  const events = new Map<string, Event>();
  for (const event of groups.flat()) {
    time(event.clock === "page-date" ? `${event.at}T00:00:00Z` : event.at);
    time(event.measuredAt);
    sourceUrl(event.source);
    if (events.has(event.id) && JSON.stringify(events.get(event.id)) !== JSON.stringify(event))
      throw new Error("Conflicting event id");
    events.set(event.id, event);
  }
  return [...events.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
}
