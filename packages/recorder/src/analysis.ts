// SPDX-License-Identifier: Apache-2.0
import {
  MAX_INDEX_ENTRIES,
  object,
  parseClaim,
  parseIndex,
  snapshotPath,
  type Claim,
  type Entry,
  type Index,
  type Json,
  type Point,
  type Snapshot,
} from "./schema";

/** Derive a sourced scalar series entry from a validated snapshot. Array fields expose counts. @example entryFor(snapshot) */
export function entryFor(snapshot: Snapshot): Entry {
  const fields: Record<string, Point> = {};
  let claims: Claim[] = [];
  for (const [key, observation] of Object.entries(snapshot.observations)) {
    if (observation.status !== "ok") continue;
    const point = (name: string, value: Point["value"]) => {
      fields[name] = { value, measuredAt: observation.measuredAt, source: observation.source };
    };
    const flatten = (value: Json, path: string, depth = 0) => {
      if (Array.isArray(value)) {
        point(`${path}.count`, value.length);
        return;
      }
      if (value !== null && typeof value === "object") {
        if (depth > 2) return;
        for (const [field, item] of Object.entries(value))
          if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(field)) flatten(item, `${path}.${field}`, depth + 1);
      } else point(path, value);
    };
    const value = object(observation.value);
    if (key === "harness") claims = (value.claims as Json[]).map(parseClaim);
    else if (key === "models") {
      point("models.count", (value.data as Json[]).length);
      point("models.miners", modelMiners(snapshot).length);
    } else if (key === "stats") flatten(value.stats as Json, key);
    else if (key === "networkValue") flatten(value.networkValue as Json, key);
    else flatten(observation.value, key);
  }
  return { id: snapshot.id, path: snapshotPath(snapshot), measuredAt: snapshot.startedAt, fields, claims };
}

/** Distinct gateway price-source addresses. This is not active capacity. @example modelMiners(snapshot) */
export function modelMiners(snapshot: Snapshot): string[] {
  const observation = snapshot.observations.models;
  if (observation.status !== "ok") return [];
  const models = object(observation.value).data as Json[];
  return [
    ...new Set(
      models.flatMap((model) =>
        (object(object(model)["x-flop"]).price_sources as Json[]).map(
          (source) => object(source).miner_address as string,
        ),
      ),
    ),
  ].sort();
}

/** Append idempotently while keeping a bounded index. Old snapshot files remain archived. @example appendIndex(index, snapshot) */
export function appendIndex(index: Index, snapshot: Snapshot): Index {
  const entry = entryFor(snapshot);
  const entries = [...index.entries.filter((existing) => existing.id !== entry.id), entry].sort((a, b) =>
    a.measuredAt.localeCompare(b.measuredAt),
  );
  const bounded = entries.slice(-MAX_INDEX_ENTRIES);
  while (new TextEncoder().encode(JSON.stringify({ version: 1, entries: bounded })).byteLength > 3_900_000)
    bounded.shift();
  return parseIndex({ version: 1, entries: bounded });
}

export type Event = {
  id: string;
  kind: "reset-signal" | "claim-change";
  measuredAt: string;
  previousAt: string;
  snapshotId: string;
  field: string;
  before: string | number;
  after: string | number;
  source: string;
};
export type Analysis = { series: Record<string, (Point & { snapshotId: string })[]>; events: Event[] };
const resetFields = [
  "stats.latestBlockNumber",
  "stats.totalAccounts",
  "indexer.stats.latestBlockNumber",
  "indexer.stats.totalAccounts",
  "indexer.block.hash",
];

/** Decreases and genesis changes are signals, not proof of a reset. Missing data never becomes zero. @example analyze(index).events */
export function analyze(index: Index): Analysis {
  const series: Analysis["series"] = {};
  const names = [...new Set(index.entries.flatMap((entry) => Object.keys(entry.fields)))].sort();
  for (const name of names)
    series[name] = index.entries.map((entry) => ({
      ...(entry.fields[name] ?? {
        value: null,
        measuredAt: entry.measuredAt,
        source: "Source unavailable in this run",
      }),
      snapshotId: entry.id,
    }));
  const events: Event[] = [];
  const previous = new Map<string, Point>();
  const previousClaims = new Map<string, Claim>();
  for (const entry of index.entries) {
    for (const field of resetFields) {
      const current = entry.fields[field];
      if (!current || current.value === null) continue;
      const before = previous.get(field);
      const changed =
        before &&
        (field === "indexer.block.hash"
          ? before.value !== current.value
          : typeof before.value === "number" && typeof current.value === "number" && current.value < before.value);
      if (changed)
        events.push({
          id: `${entry.id}:${field}`,
          kind: "reset-signal",
          measuredAt: current.measuredAt,
          previousAt: before.measuredAt,
          snapshotId: entry.id,
          field,
          before: before.value as string | number,
          after: current.value as string | number,
          source: current.source,
        });
      previous.set(field, current);
    }
    for (const claim of entry.claims) {
      const before = previousClaims.get(claim.id);
      if (before && before.status !== claim.status)
        events.push({
          id: `${entry.id}:${claim.id}`,
          kind: "claim-change",
          measuredAt: claim.measuredAt,
          previousAt: before.measuredAt,
          snapshotId: entry.id,
          field: claim.id,
          before: before.status,
          after: claim.status,
          source: claim.source,
        });
      previousClaims.set(claim.id, claim);
    }
  }
  return { series, events };
}

function xml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!,
  );
}
/** RSS includes observed changes only. An empty archive has no fabricated events. @example rss(index) */
export function rss(index: Index): string {
  const items = analyze(index)
    .events.slice()
    .reverse()
    .map(
      (event) =>
        `<item><guid isPermaLink="false">${xml(event.id)}</guid><title>${xml(`${event.kind}: ${event.field} ${event.before} to ${event.after}`)}</title><pubDate>${new Date(event.measuredAt).toUTCString()}</pubDate><description>${xml(`Compared with ${event.previousAt}. Source: ${event.source}. A reset signal is not proof of a chain reset.`)}</description></item>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>FLOP devnet history</title><link>https://github.com/zkasuran/flop-lab/tree/data</link><description>${index.entries.length ? "Recorded reset signals and harness claim changes" : "No data yet"}</description>${items}</channel></rss>`;
}
