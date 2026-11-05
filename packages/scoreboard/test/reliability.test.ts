// SPDX-License-Identifier: Apache-2.0
import { readFileSync, statSync } from "node:fs";
import { expect, it, describe } from "vitest";
import recorded from "../fixtures/reliability-04.json";
import base from "../fixtures/snapshot-04.json";
import {
  parseReliability,
  reliabilityQuery,
  scoreReliability,
  DAY_MS,
  RELIABILITY_SOURCE,
  type ReliabilityEvidence,
} from "../src/reliability";
import {
  parseSnapshot,
  Collector,
  rankSnapshot,
  rankRecordedHistory,
  pickMiner,
  fetchScoreHistory,
  parseArchive,
} from "../src/index";
import { parseModels, parseSettlements } from "../src/schema";
import { DATA_URL } from "../../recorder/src/feed";
import seedIndex from "../../recorder/test/fixtures/seed/index.json";

const now = Date.parse(base.measuredAt);
const day = Math.floor(now / DAY_MS) * DAY_MS;
const miner = recorded.miners[0]!;
const page = (data: unknown[]) => ({ data, pagination: { total: data.length, limit: 100, offset: 0, hasMore: false } });
function controlled(): ReliabilityEvidence {
  const from = day - 7 * DAY_MS,
    to = day;
  return {
    source: RELIABILITY_SOURCE,
    measuredAt: base.measuredAt,
    from,
    to,
    miners: [miner],
    query: reliabilityQuery([miner], from, to),
    raw: {
      m0: {
        miner,
        settledCount: 20,
        timeoutCount: 2,
        voidedCount: 1,
        forceOpenExpiredCount: 3,
        offerOpenFailedCount: 4,
        fraudUpheld: 1,
      },
      s0: [
        {
          miner,
          bucket: "day",
          periodStart: day - DAY_MS,
          periodEnd: day,
          forceOpenAcknowledged: 8,
          forceOpenExpired: 2,
          ghostCompleted: 6,
          ghostExpired: 1,
          ghostIncorrect: 1,
        },
      ],
      reliabilityEvents: page([{ id: "ack", miner, kind: "force_open_acked", timestamp: day - 100, blockNumber: 10 }]),
      minerGhostStatsSnapshots: page([
        {
          id: "ghost",
          miner,
          eventKind: "completed",
          timestamp: day - 100,
          blockNumber: 10,
          totalCompleted: 3,
          totalExpired: 5,
          totalIncorrect: 2,
        },
      ]),
      pouiLeaderboard: [{ submitter: miner, proofsCount: 10 }],
    },
  };
}
const score = (r = controlled(), at = now) => scoreReliability(parseReliability(r), miner, at, 8 * DAY_MS);
const term = (name: string) => score().terms.find((t) => t.name === name)!;

describe("recorded reliability and score terms", () => {
  it("collects recorded reliability through the shared client and caches all inputs", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async (url, init) => {
      calls++;
      if (String(url).startsWith(DATA_URL)) return new Response(null, { status: 404 });
      if (String(url).endsWith("/models")) return Response.json(base.records.find((r) => r.kind === "models")!.raw);
      const request = JSON.parse(String(init?.body)) as {
        id: number;
        params: { name: string; arguments: { query?: string } };
      };
      const raw = request.params.arguments.query?.includes("minerReliabilitySeries")
        ? recorded.raw
        : base.records.find((r) => r.source.endsWith(`#${request.params.name}`))!.raw;
      return Response.json({
        jsonrpc: "2.0",
        id: request.id,
        result: { content: [{ type: "text", text: JSON.stringify(raw) }] },
      });
    };
    const collector = new Collector({ fetch: fetcher, now: () => now, sleep: async () => {} });
    const snapshot = await collector.snapshot();
    expect(snapshot.reliability?.miners).toEqual(recorded.miners);
    expect(snapshot.archive?.state).toBe("empty");
    expect(snapshot.collection.requests).toBe(7);
    await collector.snapshot();
    expect(calls).toBe(7);
    expect(collector.stats.cacheHits).toBe(1);
  });
  it("validates the captured schema and all real inputs", () => {
    const view = parseReliability(recorded);
    expect(view.summaries).toHaveLength(24);
    expect(view.periods).toHaveLength(33);
    expect(view.events).toHaveLength(100);
    expect(view.ghosts).toHaveLength(100);
    expect(view.proofs).toEqual([]);
    expect(view.eventsPartial).toBe(true);
    expect(statSync(new URL("../fixtures/reliability-04.json", import.meta.url)).size).toBeLessThan(200_000);
    const rows = rankSnapshot(parseSnapshot({ ...base, reliability: recorded }), { now });
    expect(rows[0]!.scoreVersion).toBe("evidence-v2");
    expect(rows.every((r) => r.score === null || (r.score >= 0 && r.score <= 100))).toBe(true);
    expect(rows[0]!.provenance).toContainEqual({ source: RELIABILITY_SOURCE, measuredAt: recorded.measuredAt });
  });
  it("scores acknowledgement outcomes with sample discount", () => {
    expect(term("acknowledgements").value).toBeCloseTo(8 / 15, 12);
    expect(term("acknowledgements").contribution).toBeCloseTo((20 * 8) / 15, 12);
    expect(score().acknowledgements).toBe(0.8);
    expect(score().acknowledgementOutcomes).toBe(10);
  });
  it("scores ghost outcomes capped by cumulative snapshots", () => {
    expect(term("ghost").value).toBe(0.3);
    expect(term("ghost").contribution).toBe(4.5);
    expect(score().ghostStatus).toBe("failure-observed");
    const r = controlled();
    r.raw.minerGhostStatsSnapshots = page([]);
    expect(score(r).terms.find((t) => t.name === "ghost")!.value).toBeCloseTo(6 / 13, 12);
    expect(score(r).ghostPass).toBe(0.75);
  });
  it("scores cumulative outcomes and upheld fraud guard", () => {
    expect(term("outcomes").value).toBeCloseTo(20 / 35 / 2, 12);
    expect(term("outcomes").contribution).toBeCloseTo((10 * 20) / 35 / 2, 12);
  });
  it("scores proof activity without claiming proof validity", () => {
    expect(term("proofs").value).toBeCloseTo(10 / 30, 12);
    expect(term("proofs").contribution).toBeCloseTo((5 * 10) / 30, 12);
    const r = controlled();
    r.raw.pouiLeaderboard = [];
    expect(score(r).proofs).toBeNull();
    r.raw.pouiLeaderboard = [{ submitter: miner, proofsCount: 0 }];
    expect(score(r).proofs).toBe(0);
  });
  it("preserves settlement terms at half their legacy contributions", () => {
    const old = rankSnapshot(parseSnapshot(base), { now });
    const rows = rankSnapshot(parseSnapshot({ ...base, reliability: recorded }), { now });
    for (const row of rows.filter((r) => old.some((o) => o.miner === r.miner))) {
      const previous = old.find((o) => o.miner === row.miner)!;
      expect(row.terms[0]!.contribution).toBeCloseTo(previous.terms[0]!.contribution / 2, 12);
      expect(row.terms[1]!.contribution).toBeCloseTo(previous.terms[1]!.contribution / 2, 12);
    }
  });
  it("excludes partial days, future observations and out-of-window events", () => {
    const r = controlled();
    const periods = r.raw.s0 as Record<string, unknown>[];
    periods.push({ ...periods[0], periodStart: day, periodEnd: day + DAY_MS, forceOpenAcknowledged: 900 });
    expect(score(r).acknowledgementOutcomes).toBe(10);
    expect(score(r, now - 1).terms.every((t) => t.value === null)).toBe(true);
    expect(score(r, now + 9 * DAY_MS).terms.every((t) => t.value === null)).toBe(true);
    r.raw.reliabilityEvents = page([
      { id: "future", miner, kind: "force_open_expired", timestamp: day + 1, blockNumber: 11 },
    ]);
    expect(score(r).events).toEqual([]);
  });
  it("withholds all points on empty evidence", () => {
    const r = controlled();
    r.raw.m0 = {
      miner,
      settledCount: 0,
      timeoutCount: 0,
      voidedCount: 0,
      forceOpenExpiredCount: 0,
      offerOpenFailedCount: 0,
      fraudUpheld: 0,
    };
    r.raw.s0 = [];
    r.raw.minerGhostStatsSnapshots = page([]);
    r.raw.pouiLeaderboard = [];
    expect(score(r).terms.every((t) => t.value === null && t.contribution === 0)).toBe(true);
    expect(score(r).ghostStatus).toBe("unknown");
  });
  it.each([
    (r: ReliabilityEvidence) => {
      r.source = "bad" as typeof RELIABILITY_SOURCE;
    },
    (r: ReliabilityEvidence) => {
      r.query += " bad";
    },
    (r: ReliabilityEvidence) => {
      (r.raw.m0 as Record<string, unknown>).settledCount = -1;
    },
    (r: ReliabilityEvidence) => {
      (r.raw.m0 as Record<string, unknown>).settledCount = Number.MAX_SAFE_INTEGER;
    },
    (r: ReliabilityEvidence) => {
      (r.raw.m0 as Record<string, unknown>).miner = "wrong";
    },
    (r: ReliabilityEvidence) => {
      (r.raw.s0 as unknown[]).push((r.raw.s0 as unknown[])[0]);
    },
    (r: ReliabilityEvidence) => {
      r.raw.pouiLeaderboard = [{ submitter: miner, proofsCount: "1" }];
    },
    (r: ReliabilityEvidence) => {
      r.raw.errors = [];
    },
    (r: ReliabilityEvidence) => {
      r.measuredAt = new Date(r.to - 1).toISOString();
    },
  ])("rejects hostile fields before scoring", (mutate) => {
    const r = controlled();
    mutate(r);
    expect(() => parseReliability(r)).toThrow();
  });
});

describe("reliability routing policy", () => {
  function snapshot() {
    const input = parseSnapshot({ ...base, reliability: controlled() });
    const rec = input.records.find((r) => r.kind === "settlements")!;
    const row = parseSettlements(rec)[0]!;
    rec.raw = page([
      { ...row.raw, miner, selfTrade: false, agent: "test-agent", settledAt: Date.parse(rec.measuredAt) },
    ]);
    const models = input.records.find((r) => r.kind === "models")!;
    const price = parseModels(models)[0]!;
    models.raw = {
      data: [
        {
          id: price.model,
          "x-flop": {
            price_sources: [
              {
                ...price.raw,
                miner_address: miner,
                effective_at: new Date(now - 1000).toISOString(),
                expires_at: new Date(now + 60_000).toISOString(),
              },
            ],
          },
        },
      ],
    };
    return input;
  }
  const policy = { model: "qwen/qwen2.5-0.5b-instruct", now, minConfidence: 0 };
  it("picks with a measured passing policy and refuses every violated constraint", () => {
    // The captured seven-day window ends at midnight, so evaluate a matching seven-day duration.
    const s = snapshot();
    expect(pickMiner(s, { ...policy, minReliability: 0.7, minProofs: 10 }).status).toBe("picked");
    const result = pickMiner(s, {
      ...policy,
      minReliability: 0.9,
      minReliabilityOutcomes: 11,
      minProofs: 11,
      rejectGhostFailures: true,
    });
    expect(result.status).toBe("no-eligible-miner");
    expect(result.candidates.find((r) => r.miner === miner)!.reasons).toEqual(
      expect.arrayContaining([
        "reliability-too-low",
        "reliability-sample-too-small",
        "proof-activity-too-low",
        "ghost-failure-observed",
      ]),
    );
  });
  it("refuses unknown, stale and invalid policies", () => {
    const s = snapshot();
    expect(
      pickMiner(s, { ...policy, minReliability: 0, maxReliabilityAgeMs: 0, now: now + 1 }).candidates[0]!.reasons,
    ).toContain("reliability-stale");
    delete s.reliability;
    const missing = pickMiner(s, { ...policy, minReliability: 0, minProofs: 0, rejectGhostFailures: true });
    expect(missing.candidates[0]!.reasons).toEqual(
      expect.arrayContaining(["reliability-unavailable", "proof-activity-unavailable", "ghost-evidence-unavailable"]),
    );
    for (const bad of [{ minReliability: NaN }, { minReliability: 2 }, { minProofs: 0.5 }, { maxReliabilityAgeMs: -1 }])
      expect(() => pickMiner(s, { ...policy, ...bad })).toThrow();
  });
});

describe("recorder archive", () => {
  const seedFetch: typeof fetch = async (url) => {
    const path = String(url).slice(DATA_URL.length);
    const file = new URL(`../../recorder/test/fixtures/seed/${path}`, import.meta.url);
    return new Response(readFileSync(file, "utf8"));
  };
  it("reads content-checked real recorder snapshots and deduplicates history", async () => {
    const history = await fetchScoreHistory(seedFetch, now);
    expect(history.state).toBe("recorded");
    expect(history.snapshots).toHaveLength(2);
    const s = parseSnapshot(base);
    expect(history.snapshots[0]!.genesis).toBeNull();
    s.archive = history;
    expect(rankRecordedHistory(s)).toHaveLength(2);
    expect(rankRecordedHistory(s)[0]!.rows.some((r) => r.score !== null)).toBe(true);
    expect(rankSnapshot(s, { now })[0]!.provenance.every((p) => !p.source.startsWith(DATA_URL))).toBe(true);
    // Controlled chain metadata tests pooling separately from the real null genesis.
    const genesis = `0x${"a".repeat(64)}`;
    history.snapshots.forEach((r) => {
      r.genesis = genesis;
    });
    s.records.find((r) => r.kind === "indexer")!.raw.block = { number: 0, hash: genesis };
    const rows = rankSnapshot(s, { now });
    expect(rows[0]!.provenance.some((p) => p.source.startsWith(DATA_URL))).toBe(true);
    const channels = new Set(
      [
        ...history.snapshots.flatMap((r) => parseSettlements({ ...r, kind: "settlements" })),
        ...parseSettlements(s.records.find((r) => r.kind === "settlements")!),
      ]
        .filter((r) => !r.selfTrade && r.miner !== r.agent)
        .map((r) => r.channelId),
    );
    expect(rows.reduce((n, r) => n + r.settlements, 0)).toBeLessThanOrEqual(channels.size);
    history.snapshots.forEach((r) => {
      r.genesis = `0x${"f".repeat(64)}`;
    });
    expect(rankSnapshot(s, { now })[0]!.provenance.every((p) => !p.source.startsWith(DATA_URL))).toBe(true);
  });
  it("returns explicit empty and unavailable states", async () => {
    expect((await fetchScoreHistory(async () => new Response(null, { status: 404 }), now)).state).toBe("empty");
    expect(
      (
        await fetchScoreHistory(async () => {
          throw new Error("offline");
        }, now)
      ).state,
    ).toBe("unavailable");
    const badFetch: typeof fetch = async (url) =>
      String(url).endsWith("index.json") ? Response.json(seedIndex) : Response.json({ version: 1 });
    expect((await fetchScoreHistory(badFetch, now)).state).toBe("unavailable");
  });
  it("rejects untrusted paths and tampered content hashes", async () => {
    const history = await fetchScoreHistory(seedFetch, now);
    history.snapshots[0]!.source = "https://other.example/snapshot.json";
    expect(() => parseArchive(history)).toThrow();
    const altered: typeof fetch = async (url) => {
      const response = await seedFetch(url);
      const value = (await response.json()) as Record<string, unknown>;
      if (!String(url).endsWith("index.json")) value.requests = 1;
      return Response.json(value);
    };
    expect((await fetchScoreHistory(altered, now)).state).toBe("unavailable");
  });
});
