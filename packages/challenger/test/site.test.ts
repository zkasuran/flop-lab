// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { createSiteService, pageData, selectRows, SITE_TTL_MS } from "../../../apps/web/app/challenger/data";
import { challenger, fallbackTape } from "../../../apps/web/app/challenger/server";
import { withClient } from "../../../apps/web/app/challenger/collect";
import { recordedClient } from "../src/recorded";
import { recordedEvidence, recordedBundle, recordedWindows } from "../src/recorded-evidence";
import { analyzeWindows } from "../src/windows";
import { collectTape } from "../src/watcher";
import { draftDossier } from "../src/dossier";
import { analyze } from "../src/core";
import { settlement } from "../src/validation";
import type { Tape, WatchReport } from "../src/types";

const captured = Date.parse(fallbackTape.measuredAt);
const id = fallbackTape.settlements[0]!.channelId;
const collector = (tape: () => Promise<Tape>) => ({
  tape,
  dossier: vi.fn(async (report: WatchReport, channel: string) =>
    draftDossier(report, channel, recordedClient().client, undefined, { bundle: await recordedEvidence(channel) }),
  ),
});

describe("site evidence fidelity", () => {
  it("replays bundled channel evidence with original times and reports absent channels", async () => {
    const current = {
      report: analyze(fallbackTape, captured),
      state: "last-known" as const,
      attemptedAt: fallbackTape.measuredAt,
      error: null,
    };
    const first = await challenger.dossier(current, id);
    expect(first.dossier?.checks.find((check) => check.name === "Channel and tape agreement")?.status).toBe("pass");
    expect(first.dossier?.evidence.channel?.measuredAt).toBe(
      recordedBundle(id)!.observations.find((o) => o.id === "channel")!.measuredAt,
    );
    expect(first.dossier?.evidence.trustRoot?.measuredAt).toBe(
      recordedBundle(id)!.observations.find((o) => o.id === "trust-root")!.measuredAt,
    );
    const other = await challenger.dossier(current, fallbackTape.settlements[1]!.channelId);
    expect(other.dossier?.evidence.channel).toBeNull();
    expect(other.dossier?.checks.find((check) => check.name === "Channel evidence")?.status).toBe("unverifiable");
  });
  it("derives the fallback exactly from retained raw responses and labels the bounded cohort", async () => {
    const recorded = recordedClient();
    const replayed = await collectTape(recorded.client, { ...recorded.options, maxRows: 100 });
    expect(fallbackTape.settlements).toEqual(replayed.settlements);
    expect(fallbackTape.rowMeasuredAt).toEqual(replayed.rowMeasuredAt);
    expect(fallbackTape.blocks).toEqual(replayed.blocks);
    expect(fallbackTape.coverage).toEqual(replayed.coverage);
    expect(fallbackTape.coverage.complete).toBe(false);
    expect(fallbackTape.coverage.reportedTotal).toBe(336);
    expect(fallbackTape.settlements).toHaveLength(100);
  });

  it("never turns cooperative payouts into an open-window chart", async () => {
    const service = createSiteService(
      collector(async () => fallbackTape),
      fallbackTape,
      () => captured,
    );
    const view = pageData(await service.read());
    expect(selectRows(view.rows, "estimated-open", "urgency")).toEqual([]);
    expect(selectRows(view.rows, "no-standard-window", "urgency")).toHaveLength(100);
    expect(view.rows.every((row) => row.window.estimatedExpiry === null)).toBe(true);
    expect(view.rows[0]!.measuredAt).toBe("2026-11-05T09:00:01.058Z");
  });

  it("keeps an empty successful tape empty rather than reviving the fallback", async () => {
    const empty = {
      ...fallbackTape,
      mode: "live" as const,
      settlements: [],
      coverage: { complete: true, reportedTotal: 0, notes: [] },
    };
    const service = createSiteService(
      collector(async () => empty),
      fallbackTape,
      () => captured,
    );
    const view = pageData(await service.read());
    expect(view.state).toBe("live");
    expect(view.rows).toEqual([]);
    expect(view.coverage.reportedTotal).toBe(0);
  });

  it("sorts within the selected lane and retains original urgency ordering", () => {
    const posted = settlement({
      ...fallbackTape.settlements[0]!.raw,
      channelId: `0x${"a".repeat(64)}`,
      cooperative: false,
      settlementEvent: "computeChannel.SettlementPosted",
      settledAt: captured - 1000,
    });
    const report = analyze({ ...fallbackTape, settlements: [posted, ...fallbackTape.settlements] }, captured);
    const view = pageData({ report, state: "live", attemptedAt: fallbackTape.measuredAt, error: null });
    expect(selectRows(view.rows, "unknown", "priority").map((row) => row.id)).toEqual([posted.channelId]);
    expect(selectRows(view.rows, "all", "urgency")[0]!.id).toBe(posted.channelId);
    const ranked = selectRows(view.rows, "all", "priority");
    expect(ranked.map((row) => row.score)).toEqual(ranked.map((row) => row.score).sort((a, b) => b - a));
    const recent = selectRows(view.rows, "all", "recent");
    expect(recent[0]!.settledAt).toBe(captured - 1000);
    expect(view.rows[0]!.id).toBe(posted.channelId);
  });
});

describe("site cache and bounded evidence reads", () => {
  it("accepts an observed unpaid claim and retains separately dated windows after a failure", async () => {
    let now = Date.parse(recordedWindows.capturedAt);
    const windows = vi.fn().mockResolvedValueOnce(recordedWindows).mockRejectedValueOnce(new Error("offline"));
    const service = createSiteService(
      {
        tape: async () => fallbackTape,
        windows,
        dossier: async (report, id, capture) =>
          draftDossier(report, id, recordedClient().client, undefined, {
            bundle: await recordedEvidence(id),
            windows: capture,
          }),
      },
      fallbackTape,
      () => now,
      recordedWindows,
    );
    const snapshot = await service.read();
    const claim = analyzeWindows(recordedWindows).rows[0]!.channelId;
    expect(snapshot.windowState).toBe("live");
    expect((await service.dossier(snapshot, claim)).dossier?.evidence.settlement).toBeNull();
    now += SITE_TTL_MS;
    const failed = await service.read();
    expect(failed.windowState).toBe("last-known");
    expect(pageData(failed).windows?.capturedAt).toBe(recordedWindows.capturedAt);
  });
  it("coalesces concurrent reads and caches failures without redating old evidence", async () => {
    let now = captured + 60 * 60 * 1000;
    const read = vi.fn(async (): Promise<Tape> => {
      throw new Error("offline");
    });
    const service = createSiteService(collector(read), fallbackTape, () => now);
    const [first, same] = await Promise.all([service.read(), service.read()]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(same).toBe(first);
    expect(first.state).toBe("last-known");
    expect(first.error).toMatch(/last successful observation/);
    expect(first.report.tape.measuredAt).toBe(fallbackTape.measuredAt);
    expect(first.attemptedAt).toBe(new Date(now).toISOString());
    await service.read();
    expect(read).toHaveBeenCalledTimes(1);
    now += SITE_TTL_MS;
    await service.read();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("retains the last live success on failure and can recover after the TTL", async () => {
    let now = captured;
    const live = { ...fallbackTape, mode: "live" as const, measuredAt: new Date(now + 1).toISOString() };
    const read = vi
      .fn<() => Promise<Tape>>()
      .mockResolvedValueOnce(live)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(live);
    const service = createSiteService(collector(read), fallbackTape, () => now);
    expect((await service.read()).state).toBe("live");
    now += SITE_TTL_MS;
    const failed = await service.read();
    expect(failed.state).toBe("last-known");
    expect(failed.report.tape.measuredAt).toBe(live.measuredAt);
    now += SITE_TTL_MS;
    expect((await service.read()).state).toBe("live");
  });

  it("rejects malformed and unobserved channel IDs before any evidence request", async () => {
    const c = collector(async () => fallbackTape);
    const service = createSiteService(c, fallbackTape, () => captured);
    const current = await service.read();
    for (const bad of ["__proto__", "https://elsewhere.invalid", `<script>`, `0x${"0".repeat(64)}`, id.repeat(10)]) {
      expect((await service.dossier(current, bad)).dossier).toBeNull();
    }
    expect(c.dossier).not.toHaveBeenCalled();
  });

  it("caches a dossier with original evidence times and no executable extrinsic", async () => {
    const c = collector(async () => fallbackTape);
    const service = createSiteService(c, fallbackTape, () => captured);
    const current = await service.read();
    const [first, same] = await Promise.all([service.dossier(current, id), service.dossier(current, id)]);
    expect(c.dossier).toHaveBeenCalledTimes(1);
    expect(same).toBe(first);
    expect(first.dossier?.evidence.channel?.measuredAt).toBe(
      recordedBundle(id)!.observations.find((o) => o.id === "channel")!.measuredAt,
    );
    expect(first.dossier?.submission.extrinsic).toBeNull();
    await service.dossier(current, id);
    expect(c.dossier).toHaveBeenCalledTimes(1);
  });

  it("does not queue arbitrary dossier requests behind an active read", async () => {
    let release!: () => void;
    const c = collector(async () => fallbackTape);
    const original = c.dossier.getMockImplementation()!;
    c.dossier.mockImplementation(async (report, channel) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return original(report, channel);
    });
    const service = createSiteService(c, fallbackTape, () => captured);
    const current = await service.read();
    const first = service.dossier(current, id);
    expect((await service.dossier(current, fallbackTape.settlements[1]!.channelId)).error).toMatch(/Another dossier/);
    expect(c.dossier).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it("caches dossier failures rather than looping on them", async () => {
    const c = collector(async () => fallbackTape);
    c.dossier.mockRejectedValue(new Error("failed"));
    const service = createSiteService(c, fallbackTape, () => captured);
    const current = await service.read();
    expect((await service.dossier(current, id)).error).toMatch(/failed/);
    await service.dossier(current, id);
    expect(c.dossier).toHaveBeenCalledTimes(1);
  });

  it("bounds a stalled network response body and retry waits", async () => {
    const fetcher: typeof fetch = async (_url, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init!.signal!.addEventListener("abort", () => controller.error(new Error("body aborted")), { once: true });
          },
        }),
      );
    const started = performance.now();
    await expect(withClient((client) => client.callTool("flop_get_stats"), fetcher, 30)).rejects.toThrow();
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
