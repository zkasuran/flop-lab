// SPDX-License-Identifier: Apache-2.0
import { analyze } from "../../../../packages/challenger/src/core";
import type { Dossier, Tape, WatchReport } from "../../../../packages/challenger/src/types";

export const SITE_TTL_MS = 60_000;
export const PAGE_SIZE = 8;

export type SiteSnapshot = {
  report: WatchReport;
  state: "live" | "last-known";
  attemptedAt: string;
  error: string | null;
};
type DossierReply = { dossier: Dossier | null; error: string | null };
type Collector = {
  tape: () => Promise<Tape>;
  dossier: (report: WatchReport, id: string) => Promise<Dossier>;
};

/** Cache successes and failures without relabelling old evidence. Example: const service = createSiteService(collector, fallback); await service.read(). */
export function createSiteService(collector: Collector, fallback: Tape, now: () => number = Date.now) {
  let lastGood = fallback;
  let active: Promise<SiteSnapshot> | null = null;
  let snapshot: SiteSnapshot | null = null;
  let expires = 0;
  const dossiers = new Map<string, { expires: number; reply: DossierReply }>();
  let pending: { key: string; value: Promise<DossierReply> } | null = null;
  const read = async (): Promise<SiteSnapshot> => {
    if (active) return active;
    if (snapshot && now() < expires) return snapshot;
    const attemptedAt = new Date(now()).toISOString();
    active = (async () => {
      let error: string | null = null;
      let state: SiteSnapshot["state"] = "live";
      try {
        lastGood = await collector.tape();
      } catch {
        state = "last-known";
        error = "The public service did not return a usable tape. Showing the last successful observation.";
      }
      return { report: analyze(lastGood, now()), state, attemptedAt, error };
    })();
    try {
      snapshot = await active;
      expires = now() + SITE_TTL_MS;
      return snapshot;
    } finally {
      active = null;
    }
  };
  return {
    read,
    /** Only channels in this snapshot can trigger evidence requests. Example: await service.dossier(snapshot, channelId). */
    async dossier(current: SiteSnapshot, id: string): Promise<DossierReply> {
      if (!/^0x[0-9a-f]{64}$/i.test(id) || !current.report.rows.some((row) => row.settlement.channelId === id))
        return { dossier: null, error: "Choose an exact channel from the observed tape." };
      const key = `${current.report.tape.measuredAt}:${id}`;
      const hit = dossiers.get(key);
      if (hit && now() < hit.expires) return hit.reply;
      if (pending) {
        if (pending.key === key) return pending.value;
        return { dossier: null, error: "Another dossier is loading. Try this channel again shortly." };
      }
      const value = collector.dossier(current.report, id).then(
        (dossier): DossierReply => ({ dossier, error: null }),
        (): DossierReply => ({
          dossier: null,
          error: "Evidence collection failed. The settlement observation is still available.",
        }),
      );
      pending = { key, value };
      try {
        const reply = await value;
        if (dossiers.size >= 16) dossiers.delete(dossiers.keys().next().value!);
        dossiers.set(key, { reply, expires: now() + SITE_TTL_MS });
        return reply;
      } finally {
        pending = null;
      }
    },
  };
}

/** Keep public page props small while preserving per-row provenance. Example: pageData(await service.read()). */
export function pageData(snapshot: SiteSnapshot) {
  const { report } = snapshot;
  return {
    state: snapshot.state,
    error: snapshot.error,
    attemptedAt: snapshot.attemptedAt,
    measuredAt: report.tape.measuredAt,
    evaluatedAt: report.evaluatedAt,
    source: report.tape.source,
    coverage: report.tape.coverage,
    requests: report.tape.requests,
    assumptions: report.assumptions,
    blockCadence: report.blockCadence,
    warnings: report.tape.warnings,
    rows: report.rows.map(({ settlement: row, window, priority, measuredAt }) => ({
      id: row.channelId,
      miner: row.miner,
      paid: row.minerPaid,
      block: row.settledBlock,
      settledAt: row.settledAt,
      event: row.settlementEvent,
      window,
      score: priority.score,
      signals: priority.confidence.availableSignals,
      totalSignals: priority.confidence.totalSignals,
      measuredAt,
    })),
  };
}

export type PageData = ReturnType<typeof pageData>;
export type PageRow = PageData["rows"][number];
export type Filter = "all" | "estimated-open" | "unknown" | "no-standard-window";

/** Filter before paging and keep ties stable. Example: selectRows(data.rows, "all", "priority"). */
export function selectRows(rows: PageRow[], filter: Filter, sort: "urgency" | "priority" | "recent") {
  const result = rows.filter((row) => filter === "all" || row.window.status === filter);
  if (sort === "priority") result.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (sort === "recent") result.sort((a, b) => b.settledAt - a.settledAt || a.id.localeCompare(b.id));
  return result;
}
