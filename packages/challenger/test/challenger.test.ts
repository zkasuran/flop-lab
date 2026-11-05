// SPDX-License-Identifier: Apache-2.0
import { beforeAll, describe, expect, it } from "vitest";
import { McpClient, type Settlement } from "@flop-lab/mcp";
import {
  analyze,
  collectTape,
  draftDossier,
  estimateWindow,
  formatFlop,
  prioritize,
  Watcher,
  WINDOW_MS,
  CACHE_TTL_MS,
  type Tape,
} from "../src/index";
import { recordedClient } from "../src/recorded";
import { settlement } from "../src/validation";

let tape: Tape;
let original: Settlement;
const now = Date.parse("2026-11-05T09:00:03.613Z");
beforeAll(async () => {
  const recorded = recordedClient();
  tape = await collectTape(recorded.client, recorded.options);
  original = tape.settlements[0]!;
});

function row(changes: Record<string, unknown> = {}): Settlement {
  return settlement({ ...original.raw, ...changes });
}

function cohort(rows: Settlement[]): Tape {
  return { ...tape, settlements: rows };
}

function server(answer: (name: string, args: Record<string, unknown>) => unknown): McpClient {
  return new McpClient({
    retries: 0,
    minIntervalMs: 0,
    fetch: async (_url, init) => {
      const req = JSON.parse(String(init?.body)) as {
        id: number;
        params: { name: string; arguments: Record<string, unknown> };
      };
      const value = answer(req.params.name, req.params.arguments);
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: req.id,
          result: { content: [{ type: "text", text: JSON.stringify(value) }] },
        }),
      );
    },
  });
}

function page(data: unknown[], total = data.length, offset = 0, hasMore = false) {
  return { data, pagination: { limit: 100, offset, total, hasMore } };
}

describe("recorded reality", () => {
  it("collects all recorded pages with original provenance and measured block cadence", () => {
    expect(tape.settlements).toHaveLength(336);
    expect(tape.coverage.complete).toBe(true);
    expect(tape.requests).toBe(7);
    expect(tape.pages.map((p) => p.offset)).toEqual([0, 100, 200, 300]);
    const report = analyze(tape, now);
    expect(report.blockCadence?.milliseconds).toBe(1020);
    expect(report.blockCadence?.intervals).toBe(100);
    expect(report.rows.find((r) => r.settlement.channelId === original.channelId)?.measuredAt).toBe(
      "2026-11-05T09:00:01.058Z",
    );
    expect(tape.measuredAt).toBe("2026-11-05T09:00:03.613Z");
    expect(report.rows.every((r) => r.window.status === "no-standard-window")).toBe(true);
    expect(report.rows.every((r) => r.priority.score >= 0 && r.priority.score <= 100)).toBe(true);
  });

  it("drafts exact arithmetic plus explicit public-audit gaps without an extrinsic", async () => {
    const { client } = recordedClient();
    const dossier = await draftDossier(analyze(tape, now), original.channelId, client);
    expect(dossier.mode).toBe("DRY RUN ONLY");
    expect(dossier.submission).toMatchObject({ available: false, extrinsic: null });
    expect(dossier.submission.documentedCalls[0]?.signature).toBe(
      "computeChannel.reportToplocMismatch(channelId, miner, attestations)",
    );
    expect(dossier.checks.find((c) => c.name === "Escrow conservation")?.status).toBe("pass");
    expect(dossier.checks.find((c) => c.name === "Channel and tape agreement")?.status).toBe("pass");
    expect(dossier.checks.find((c) => c.name === "Finality")?.status).toBe("unverifiable");
    expect(dossier.evidence.channel?.value.evidenceStatus).toBe("WITNESS_ONLY");
    expect(dossier.evidence.channel?.measuredAt).toBe("2026-11-05T09:00:01.669Z");
    expect(dossier.evidence.trustRoot?.measuredAt).toBe("2026-11-05T09:00:02.673Z");
    expect(client.stats.requests).toBe(2);
  });
});

describe("window arithmetic", () => {
  it("expires exactly at the estimated boundary", () => {
    const s = row({
      settledAt: now - WINDOW_MS,
      cooperative: false,
      settlementEvent: "computeChannel.SettlementPosted",
    });
    expect(estimateWindow(s, now - 1)).toMatchObject({ status: "estimated-open", remainingMs: 1 });
    expect(estimateWindow(s, now)).toMatchObject({ status: "estimated-expired", remainingMs: 0 });
    expect(estimateWindow(s, now + 1).remainingMs).toBe(0);
  });

  it("leaves future settlement times unknown and rejects invalid evaluation times", () => {
    expect(estimateWindow(row({ settledAt: now + 1 }), now)).toMatchObject({
      status: "unknown",
      estimatedExpiry: null,
      remainingMs: null,
    });
    expect(() => estimateWindow(original, NaN)).toThrow();
  });

  it("sorts open rows by urgency before unknown and expired rows", () => {
    const report = analyze(
      cohort([
        row({
          channelId: "later",
          settledAt: now - 1,
          cooperative: false,
          settlementEvent: "computeChannel.SettlementPosted",
        }),
        row({
          channelId: "expired",
          settledAt: now - WINDOW_MS,
          cooperative: false,
          settlementEvent: "computeChannel.SettlementPosted",
        }),
        row({ channelId: "unknown", settledAt: now + 1 }),
        row({
          channelId: "first",
          settledAt: now - WINDOW_MS + 1,
          cooperative: false,
          settlementEvent: "computeChannel.SettlementPosted",
        }),
      ]),
      now,
    );
    expect(report.rows.map((r) => r.settlement.channelId)).toEqual(["first", "later", "unknown", "expired"]);
  });

  it("does not start a dispute window at a cooperative or finalized payout", () => {
    expect(estimateWindow(original, now)).toMatchObject({
      status: "no-standard-window",
      estimatedExpiry: null,
      remainingMs: null,
    });
    expect(estimateWindow(row({ cooperative: false }), now)).toMatchObject({
      status: "unknown",
      estimatedExpiry: null,
      remainingMs: null,
    });
  });
});

describe("review policy", () => {
  function scored() {
    const target = row({
      channelId: "target",
      minerPaid: "100",
      escrow: "200",
      unusedEscrow: "50",
      cooperative: false,
      settledBlock: 30,
      settledAt: now,
      pricePerGflop: "7",
    });
    const rows = [
      target,
      ...[2, 3, 4].map((price, i) =>
        row({
          channelId: `peer-${i}`,
          minerPaid: "50",
          pricePerGflop: String(price),
          settledBlock: [10, 20, 40][i],
          settledAt: now - 1000,
          cooperative: i !== 0,
        }),
      ),
    ];
    return { target, rows };
  }

  it("calculates the written weights and excludes future blocks from miner history", () => {
    const { target, rows } = scored();
    const result = prioritize(target, cohort(rows));
    expect(result.signals.map((s) => s.points)).toEqual([25, 20, 3.75, 10, 7.5, 15]);
    expect(result.score).toBe(81.25);
    expect(result.priorMinerSettlements).toBe(2);
    expect(result.confidence.availableSignals).toBe(6);
  });

  it("keeps missing assurance, absent history and thin price cohorts unavailable", () => {
    const target = row({ assuranceTier: null, escrow: "0", unusedEscrow: "0", minerPaid: "0" });
    const result = prioritize(target, cohort([target]));
    expect(result.signals.map((s) => s.points)).toEqual([null, 0, null, null, null, null]);
    expect(result.confidence.availableSignals).toBe(1);
    expect(result.score).toBe(0);
  });

  it("compares high-precision decimal prices at the exact twice-median threshold", () => {
    const { target, rows } = scored();
    const peers = rows.slice(1).map((s) => row({ ...s.raw, pricePerGflop: "9007199254740993.000000000000000001" }));
    const at = row({ ...target.raw, pricePerGflop: "18014398509481986.000000000000000002" });
    const above = row({ ...target.raw, pricePerGflop: "18014398509481986.000000000000000003" });
    expect(prioritize(at, cohort([at, ...peers])).signals.at(-1)?.points).toBe(0);
    expect(prioritize(above, cohort([above, ...peers])).signals.at(-1)?.points).toBe(15);
  });

  it("does not compare prices across models, tiers or markets", () => {
    const { target, rows } = scored();
    const peers = rows.slice(1).map((s) => row({ ...s.raw, modelHash: "different" }));
    expect(prioritize(target, cohort([target, ...peers])).signals.at(-1)?.points).toBeNull();
  });

  it("formats raw FLOP units without losing a base unit", () => {
    expect(formatFlop("1000000000000000001")).toBe("1.000000000000000001");
    expect(formatFlop("0")).toBe("0");
  });
});

describe("hostile network boundaries", () => {
  it.each([
    { settledAt: 1.25 },
    { settledBlock: -1 },
    { settledBlock: Number.MAX_SAFE_INTEGER + 1 },
    { pricePerGflop: "Infinity" },
    { pricePerGflop: "1e30" },
    { escrow: "-1" },
    { channelId: "\u001b[31mspoof" },
    { assuranceTier: 1 },
    { escrow: "1".repeat(101) },
  ])("rejects malformed settlement %j", (change) => {
    expect(() => row(change)).toThrow();
  });

  it("returns an empty report with no invented cadence when public data is empty", async () => {
    const client = server((name) => (name === "flop_list_settlements" ? page([]) : {}));
    const empty = await collectTape(client);
    expect(analyze(empty, now).rows).toEqual([]);
    expect(analyze(empty, now).blockCadence).toBeNull();
    expect(empty.coverage.complete).toBe(true);
    expect(empty.warnings).toHaveLength(1);
  });

  it("stops an empty page that claims more rows", async () => {
    const result = await collectTape(server((name) => (name === "flop_list_settlements" ? page([], 10, 0, true) : {})));
    expect(result.coverage.complete).toBe(false);
    expect(result.pages).toHaveLength(1);
  });

  it("marks duplicate pages and count drift partial without double-counting", async () => {
    const result = await collectTape(
      server((name, args) =>
        name === "flop_list_settlements"
          ? page([original.raw], args.offset === 0 ? 2 : 3, Number(args.offset), args.offset === 0)
          : {},
      ),
    );
    expect(result.settlements).toHaveLength(1);
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.notes.join(" ")).toContain("Duplicate");
    expect(result.coverage.notes.join(" ")).toContain("changed");
  });

  it("enforces bounds and rejects response offsets that differ from the request", async () => {
    await expect(collectTape(server(() => page([original.raw], 1, 9)))).rejects.toThrow("pagination");
    await expect(
      collectTape(
        server(() => page([])),
        { maxRows: 0 },
      ),
    ).rejects.toThrow("maxRows");
    const result = await collectTape(
      server((name) => (name === "flop_list_settlements" ? page([original.raw], 2, 0, true) : {})),
      { maxRows: 1 },
    );
    expect(result.coverage.complete).toBe(false);
    expect(result.pages).toHaveLength(1);
  });

  it("does not turn channel mismatches or arithmetic failures into passing evidence", async () => {
    const bad = row({ unusedEscrow: "0" });
    const report = analyze(cohort([bad]), now);
    const client = server((name) =>
      name === "flop_get_compute_channel" ? { channelId: "different" } : { snapshotHash: "observed" },
    );
    const dossier = await draftDossier(report, bad.channelId, client);
    expect(dossier.checks.find((c) => c.name === "Escrow conservation")?.status).toBe("fail");
    expect(dossier.checks.find((c) => c.name === "Channel and tape agreement")?.status).toBe("fail");
    expect(dossier.submission.extrinsic).toBeNull();
  });

  it("keeps incomplete or malformed evidence unverifiable", async () => {
    const client = server((name) =>
      name === "flop_get_compute_channel" ? { channelId: original.channelId, minerPaid: 1 } : {},
    );
    const dossier = await draftDossier(analyze(tape, now), original.channelId, client);
    expect(dossier.evidence.channel).toBeNull();
    expect(dossier.evidence.trustRoot).toBeNull();
    expect(dossier.checks.filter((c) => c.status === "unverifiable").length).toBeGreaterThan(4);
    await expect(draftDossier(analyze(tape, now), "missing", client)).rejects.toThrow("not in");
  });
});

describe("cache", () => {
  it("shares concurrent requests and refreshes at the explicit TTL without mutation leaks", async () => {
    let clock = now;
    const client = server((name) => (name === "flop_list_settlements" ? page([]) : {}));
    const watcher = new Watcher(client, { now: () => clock });
    const [a, b] = await Promise.all([watcher.read(), watcher.read()]);
    expect(client.stats.requests).toBe(2);
    a.warnings.push("consumer mutation");
    expect(b.warnings).not.toContain("consumer mutation");
    clock += CACHE_TTL_MS - 1;
    expect((await watcher.read()).measuredAt).toBe(a.measuredAt);
    expect(client.stats.requests).toBe(2);
    clock += 1;
    await watcher.read();
    expect(client.stats.requests).toBe(4);
  });

  it("caches failures to avoid retry loops", async () => {
    const client = server(() => {
      throw new Error("offline");
    });
    const watcher = new Watcher(client, { now: () => now });
    await expect(watcher.read()).rejects.toThrow("offline");
    await expect(watcher.read()).rejects.toThrow("offline");
    expect(client.stats.requests).toBe(1);
  });
});
