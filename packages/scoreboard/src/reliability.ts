// SPDX-License-Identifier: Apache-2.0
import { list, object, parsePage, text, timestamp } from "./schema";

export const RELIABILITY_SOURCE = "https://mcp.flop.network/mcp#flop_indexer_query";
export const DAY_MS = 86_400_000;
export const MAX_MINERS = 32;
const counts = [
  "settledCount",
  "timeoutCount",
  "voidedCount",
  "forceOpenExpiredCount",
  "offerOpenFailedCount",
  "fraudUpheld",
] as const;
const seriesCounts = [
  "forceOpenAcknowledged",
  "forceOpenExpired",
  "ghostCompleted",
  "ghostExpired",
  "ghostIncorrect",
] as const;
type Counts<K extends string> = Record<K, number>;
export type ReliabilitySummary = Counts<(typeof counts)[number]> & { miner: string };
export type ReliabilityPeriod = Counts<(typeof seriesCounts)[number]> & {
  miner: string;
  bucket: "day";
  periodStart: number;
  periodEnd: number;
};
export interface ReliabilityEvent {
  id: string;
  miner: string | null;
  kind: string;
  timestamp: number;
  blockNumber: number;
}
export interface GhostSnapshot {
  id: string;
  miner: string;
  eventKind: string;
  timestamp: number;
  blockNumber: number;
  totalCompleted: number | null;
  totalExpired: number | null;
  totalIncorrect: number | null;
}
export interface ProofActivity {
  submitter: string;
  proofsCount: number | null;
}
export interface ReliabilityEvidence {
  source: typeof RELIABILITY_SOURCE;
  measuredAt: string;
  from: number;
  to: number;
  miners: string[];
  query: string;
  raw: Record<string, unknown>;
}
export interface ReliabilityView {
  evidence: ReliabilityEvidence;
  summaries: ReliabilitySummary[];
  periods: ReliabilityPeriod[];
  events: ReliabilityEvent[];
  ghosts: GhostSnapshot[];
  proofs: ProofActivity[];
  eventsPartial: boolean;
  ghostsPartial: boolean;
}
function count(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new Error(`Invalid ${label}`);
  return v;
}
function nullableCount(v: unknown, label: string) {
  return v === null ? null : count(v, label);
}
function numbers<K extends string>(row: Record<string, unknown>, keys: readonly K[]): Counts<K> {
  return Object.fromEntries(keys.map((k) => [k, count(row[k], k)])) as Counts<K>;
}
function unique<T>(rows: T[], key: (row: T) => string): T[] {
  if (new Set(rows.map(key)).size !== rows.length) throw new Error("Duplicate reliability evidence");
  return rows;
}

/** Fixed bounded query over introspected fields. @example reliabilityQuery([miner], from, to) */
export function reliabilityQuery(miners: string[], from: number, to: number): string {
  if (miners.length > MAX_MINERS || new Set(miners).size !== miners.length || miners.some((m) => !m || m.length > 256))
    throw new Error("Invalid reliability miners");
  count(from, "from");
  count(to, "to");
  if (from >= to || to - from > 31 * DAY_MS) throw new Error("Invalid reliability window");
  return `{ ${miners
    .map(
      (miner, i) => `m${i}: minerReliability(miner: ${JSON.stringify(miner)}) { miner ${counts.join(" ")} }
    s${i}: minerReliabilitySeries(miner: ${JSON.stringify(miner)}, bucket: "day", from: ${from}, to: ${to}) { miner bucket periodStart periodEnd ${seriesCounts.join(" ")} }`,
    )
    .join("\n")}
    reliabilityEvents(limit: 100, offset: 0) { data { id miner kind timestamp blockNumber } pagination { total limit offset hasMore } }
    minerGhostStatsSnapshots(limit: 100, offset: 0) { data { id miner eventKind timestamp blockNumber totalCompleted totalExpired totalIncorrect } pagination { total limit offset hasMore } }
    pouiLeaderboard(limit: 100, since: ${from}) { submitter proofsCount }
  }`;
}

/** Validate every scored value and its query window. @example parseReliability(recordedEvidence) */
export function parseReliability(input: unknown): ReliabilityView {
  const o = object(input, "reliability");
  if (o.source !== RELIABILITY_SOURCE) throw new Error("Unexpected reliability source");
  const measuredAt = timestamp(o.measuredAt, "reliability.measuredAt");
  const from = count(o.from, "from"),
    to = count(o.to, "to");
  const miners = list(o.miners, "miners").map((v) => text(v, "miner"));
  const query = reliabilityQuery(miners, from, to);
  if (o.query !== query || to > Date.parse(measuredAt)) throw new Error("Reliability query or time mismatch");
  const raw = object(o.raw, "reliability.raw");
  if (raw.errors !== undefined) throw new Error("Indexer returned errors");
  const summaries = miners.map((miner, i) => {
    const row = object(raw[`m${i}`], "minerReliability");
    if (row.miner !== miner) throw new Error("Summary miner mismatch");
    return { miner, ...numbers(row, counts) };
  });
  const periods = miners.flatMap((miner, i) =>
    unique(
      list(raw[`s${i}`], "series").map((v) => {
        const row = object(v, "period");
        if (row.miner !== miner || row.bucket !== "day") throw new Error("Series miner or bucket mismatch");
        const periodStart = count(row.periodStart, "periodStart"),
          periodEnd = count(row.periodEnd, "periodEnd");
        if (periodStart % DAY_MS !== 0 || periodEnd !== periodStart + DAY_MS) throw new Error("Invalid day bucket");
        return { miner, bucket: "day" as const, periodStart, periodEnd, ...numbers(row, seriesCounts) };
      }),
      (row) => `${row.miner}:${row.periodStart}`,
    ),
  );
  const eventsPage = parsePage(object(raw.reliabilityEvents, "events"));
  const ghostsPage = parsePage(object(raw.minerGhostStatsSnapshots, "ghosts"));
  const events = unique(
    eventsPage.data.map((v) => {
      const r = object(v, "event");
      return {
        id: text(r.id, "event.id"),
        miner: r.miner === null ? null : text(r.miner, "event.miner"),
        kind: text(r.kind, "event.kind"),
        timestamp: count(r.timestamp, "timestamp"),
        blockNumber: count(r.blockNumber, "blockNumber"),
      };
    }),
    (r) => r.id,
  );
  const ghosts = unique(
    ghostsPage.data.map((v) => {
      const r = object(v, "ghost snapshot");
      return {
        id: text(r.id, "ghost.id"),
        miner: text(r.miner, "ghost.miner"),
        eventKind: text(r.eventKind, "eventKind"),
        timestamp: count(r.timestamp, "timestamp"),
        blockNumber: count(r.blockNumber, "blockNumber"),
        totalCompleted: nullableCount(r.totalCompleted, "totalCompleted"),
        totalExpired: nullableCount(r.totalExpired, "totalExpired"),
        totalIncorrect: nullableCount(r.totalIncorrect, "totalIncorrect"),
      };
    }),
    (r) => r.id,
  );
  const proofs = unique(
    list(raw.pouiLeaderboard, "proofs").map((v) => {
      const r = object(v, "proof activity");
      return { submitter: text(r.submitter, "submitter"), proofsCount: nullableCount(r.proofsCount, "proofsCount") };
    }),
    (r) => r.submitter,
  );
  for (const page of [eventsPage, ghostsPage])
    if (page.offset !== 0 || page.data.length > 100) throw new Error("Unexpected reliability page");
  if (proofs.length > 100) throw new Error("Unexpected proof page");
  for (const summary of summaries)
    count(
      counts.reduce((n, k) => n + summary[k], 0),
      "summary sum",
    );
  for (const miner of miners)
    count(
      periods.filter((p) => p.miner === miner).reduce((n, p) => n + seriesCounts.reduce((s, k) => s + p[k], 0), 0),
      "period sum",
    );
  for (const ghost of ghosts)
    count((ghost.totalCompleted ?? 0) + (ghost.totalExpired ?? 0) + (ghost.totalIncorrect ?? 0), "ghost sum");
  const partial = (p: ReturnType<typeof parsePage>) => p.hasMore || p.offset !== 0 || p.data.length < p.total;
  return {
    evidence: { source: RELIABILITY_SOURCE, measuredAt, from, to, miners, query, raw },
    summaries,
    periods,
    events,
    ghosts,
    proofs,
    eventsPartial: partial(eventsPage),
    ghostsPartial: partial(ghostsPage),
  };
}

export interface MinerReliability {
  from: number | null;
  to: number | null;
  measuredAt: string | null;
  source: string;
  acknowledgements: number | null;
  acknowledgementOutcomes: number;
  ghostPass: number | null;
  ghostStatus: "failure-observed" | "completion-observed" | "unknown";
  proofs: number | null;
  cumulative: ReliabilitySummary | null;
  periods: ReliabilityPeriod[];
  events: ReliabilityEvent[];
  ghostSnapshots: GhostSnapshot[];
  terms: { name: string; weight: number; value: number | null; contribution: number }[];
  warnings: string[];
}

/** Score bounded observations, withholding points for missing evidence. @example scoreReliability(view, miner, now, windowMs) */
export function scoreReliability(
  view: ReliabilityView | undefined,
  miner: string,
  now: number,
  windowMs: number,
): MinerReliability {
  const evidence = view?.evidence;
  // The query defines a captured window. Do not relabel it as a live rolling window.
  const usable =
    !!evidence &&
    Date.parse(evidence.measuredAt) <= now &&
    now - evidence.to <= windowMs &&
    evidence.to - evidence.from <= windowMs;
  const start = evidence?.from ?? now;
  const end = Math.min(now, evidence?.to ?? now);
  const periods = usable
    ? view.periods.filter((p) => p.miner === miner && p.periodStart >= start && p.periodEnd <= end)
    : [];
  const sum = (key: (typeof seriesCounts)[number]) => periods.reduce((n, p) => n + p[key], 0);
  const ack = sum("forceOpenAcknowledged"),
    expired = sum("forceOpenExpired");
  const completed = sum("ghostCompleted"),
    failed = sum("ghostExpired") + sum("ghostIncorrect");
  const events = usable
    ? view.events
        .filter((e) => e.miner === miner && e.timestamp >= start && e.timestamp <= end)
        .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
    : [];
  const ghostSnapshots = usable
    ? view.ghosts
        .filter((e) => e.miner === miner && e.timestamp >= start && e.timestamp <= end)
        .sort((a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber)
    : [];
  const latest = ghostSnapshots.at(-1);
  const ghostCounts =
    latest && latest.totalCompleted !== null && latest.totalExpired !== null && latest.totalIncorrect !== null
      ? { completed: latest.totalCompleted, failed: latest.totalExpired + latest.totalIncorrect }
      : null;
  const cumulative = usable ? (view.summaries.find((r) => r.miner === miner) ?? null) : null;
  const proofs = usable ? (view.proofs.find((r) => r.submitter === miner)?.proofsCount ?? null) : null;
  const outcomes = cumulative
    ? cumulative.settledCount +
      cumulative.timeoutCount +
      cumulative.voidedCount +
      cumulative.forceOpenExpiredCount +
      cumulative.offerOpenFailedCount
    : 0;
  const ackValue = ack + expired ? ack / (ack + expired + 5) : null;
  const ghostValue = completed + failed ? completed / (completed + failed + 5) : null;
  // A cumulative ghost snapshot can lower a window term, never invent a successful window.
  const ghostCap =
    ghostCounts && ghostCounts.completed + ghostCounts.failed
      ? ghostCounts.completed / (ghostCounts.completed + ghostCounts.failed)
      : 1;
  const terms = [
    { name: "acknowledgements", weight: 0.2, value: ackValue },
    { name: "ghost", weight: 0.15, value: ghostValue === null ? null : Math.min(ghostValue, ghostCap) },
    {
      name: "outcomes",
      weight: 0.1,
      value: cumulative && outcomes ? cumulative.settledCount / (outcomes + 5) / (1 + cumulative.fraudUpheld) : null,
    },
    { name: "proofs", weight: 0.05, value: proofs === null ? null : proofs / (proofs + 20) },
  ].map((t) => ({ ...t, contribution: 100 * t.weight * (t.value ?? 0) }));
  const warnings = [
    "Reliability terms are evidence heuristics, not uptime or FRCR. Only complete day buckets are scored.",
  ];
  if (!usable) warnings.push("No usable reliability window. Missing terms earn no points.");
  if (view?.eventsPartial || view?.ghostsPartial)
    warnings.push("Event and ghost history is bounded. Missing rows do not establish absence.");
  return {
    from: evidence?.from ?? null,
    to: evidence?.to ?? null,
    measuredAt: evidence?.measuredAt ?? null,
    source: RELIABILITY_SOURCE,
    acknowledgements: ack + expired ? ack / (ack + expired) : null,
    acknowledgementOutcomes: ack + expired,
    ghostPass: completed + failed ? completed / (completed + failed) : null,
    ghostStatus:
      failed > 0 || (ghostCounts?.failed ?? 0) > 0
        ? "failure-observed"
        : completed > 0
          ? "completion-observed"
          : "unknown",
    proofs,
    cumulative,
    periods,
    events,
    ghostSnapshots,
    terms,
    warnings,
  };
}
