// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import parameters from "../fixtures/windows/parameters.json";
import { recordedBundle, recordedWindows } from "../src/recorded-evidence";
import { analyzeWindows, collectWindows, CLOSING_BLOCKS, WINDOW_PARAMETER, type WindowCapture } from "../src/windows";
import { McpClient } from "../../mcp/src/index";
import { analyze } from "../src/core";
import { collectTape } from "../src/watcher";
import { recordedClient } from "../src/recorded";
import { draftDossier } from "../src/dossier";
import { dossierMarkdown, replayDossier, sealDossier } from "../src/export";
import { sealEvidence, verifyEvidence } from "../../verifier/src/index";

const real = analyzeWindows(recordedWindows);
const id = real.rows[0]!.channelId;
// Synthetic mutations of recorded raw evidence test exact boundaries and hostile responses.
function changed(id: string, edit: (value: Record<string, unknown>) => void): WindowCapture {
  const c = structuredClone(recordedWindows);
  const o = c.observations.find((o) => o.id === id)!;
  const value = JSON.parse(o.raw!) as Record<string, unknown>;
  edit(value);
  o.raw = JSON.stringify(value);
  return c;
}
function channel(change: Record<string, unknown>) {
  return changed("windows", (value) => {
    const page = value.computeChannels as { data: Record<string, unknown>[] };
    const row = page.data.find((r) => r.channelId === id)!;
    Object.assign(row, change);
  });
}
describe("recorded block-window evidence", () => {
  it("replays the recorded request sequence through the shared client with bounded collection", async () => {
    const expected = [...recordedWindows.observations];
    const client = new McpClient({
      retries: 0,
      minIntervalMs: 0,
      fetch: async (_url, init) => {
        const request = JSON.parse(String(init?.body)) as {
          id: number;
          params: { name: string; arguments: Record<string, unknown> };
        };
        const observation = expected.shift()!;
        expect(request.params.name).toBe(observation.tool);
        expect(request.params.arguments).toEqual(observation.args);
        return new Response(
          `data: ${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: observation.raw }] } })}\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const capture = await collectWindows(client);
    expect(expected).toEqual([]);
    expect(capture.requests).toBe(4);
    expect(analyzeWindows(capture).rows.map((row) => [row.channelId, row.status, row.remainingBlocks])).toEqual(
      real.rows.map((row) => [row.channelId, row.status, row.remainingBlocks]),
    );
  });
  it("uses the pinned dispute parameter rather than the capacity exposure parameter", () => {
    const clause = parameters.raw.split("- name: channel_dispute_window_blocks")[1]!.split("- name:")[0]!;
    expect(clause).toContain(WINDOW_PARAMETER.quote);
    expect(clause).toContain(`value: ${WINDOW_PARAMETER.blocks.toLocaleString("en-US").replaceAll(",", "_")}`);
    expect(WINDOW_PARAMETER.source).toBe(parameters.source);
    expect(WINDOW_PARAMETER.measuredAt).toBe(parameters.measuredAt);
  });
  it("replays real forced claims without manufacturing a payout or current time", () => {
    expect(real.rows).toHaveLength(10);
    expect(real.rows.filter((r) => r.status === "open")).toHaveLength(3);
    expect(real.rows.filter((r) => r.status === "closed")).toHaveLength(7);
    expect(real.head?.number).toBe(3013999);
    expect(real.cadence).toMatchObject({ milliseconds: 1000, intervals: 100 });
    expect(real.rows[0]).toMatchObject({ endBlock: 3378395, remainingBlocks: 364396, estimatedRemainingMs: 364396000 });
    expect(real.rows[0]!.estimatedExpiry).toBe("2026-11-10T09:05:24.355Z");
    expect(real.complete).toBe(true);
  });
  it("has an exact conservative end boundary and a distinct attention threshold", () => {
    const head = real.head!.number;
    for (const [remaining, status] of [
      [-1, "closed"],
      [0, "closed"],
      [1, "closing"],
      [CLOSING_BLOCKS, "closing"],
      [CLOSING_BLOCKS + 1, "open"],
    ] as const) {
      const row = analyzeWindows(channel({ challengeEnd: head + remaining })).rows.find((r) => r.channelId === id)!;
      expect(row.status).toBe(status);
      expect(row.remainingBlocks).toBe(Math.max(0, remaining));
    }
  });
  it("never substitutes best head for unavailable finality and freezes time estimates in safe mode", () => {
    const missing = changed("window-head", (value) => {
      (value.stats as { finality: { finalizedBlock: null } }).finality.finalizedBlock = null;
    });
    expect(analyzeWindows(missing).rows.every((r) => r.status === "unknown")).toBe(true);
    const stalled = changed("window-head", (value) => {
      (value.stats as { finality: { safeMode: boolean } }).finality.safeMode = true;
    });
    expect(analyzeWindows(stalled).rows.every((r) => r.estimatedRemainingMs === null)).toBe(true);
  });
  it.each([
    { cooperative: true },
    { status: "settled" },
    { challengeEnd: null },
    { challengeEnd: 1 },
    { finalRoot: null },
    { statusBlockNumber: 999999999 },
  ])("does not invent eligibility from contradictory or missing fields %j", (change) => {
    expect(analyzeWindows(channel(change)).rows.find((r) => r.channelId === id)?.status).toBe("unknown");
  });
  it("rejects malformed amounts, duplicate IDs, head regression and invalid cadence", () => {
    expect(analyzeWindows(channel({ escrow: "NaN" })).rows).toEqual([]);
    expect(analyzeWindows(channel({ channelId: real.rows[1]!.channelId })).rows).toEqual([]);
    const regression = changed("window-head", (value) => {
      (value.stats as { finality: { bestBlock: number } }).finality.bestBlock = 1;
    });
    expect(analyzeWindows(regression).head).toBeNull();
    const badBlock = changed("window-block:3013999", (value) => {
      (value.block as { number: number }).number = 2;
    });
    expect(analyzeWindows(badBlock).cadence).toBeNull();
    expect(analyzeWindows(badBlock).rows[0]?.status).toBe("open");
  });
  it("keeps empty data distinct from unavailable and marks truncation partial", () => {
    const empty = changed("windows", (value) => {
      value.computeChannels = { data: [], pagination: { total: 0, offset: 0, limit: 100, hasMore: false } };
    });
    expect(analyzeWindows(empty)).toMatchObject({ rows: [], complete: true, total: 0 });
    const partial = changed("windows", (value) => {
      (value.computeChannels as { pagination: { hasMore: boolean } }).pagination.hasMore = true;
    });
    expect(analyzeWindows(partial).complete).toBe(false);
  });
});

describe("portable verifier-backed dossiers", () => {
  async function draft(channelId = id) {
    const r = recordedClient();
    const tape = await collectTape(r.client, r.options);
    const before = r.client.stats.requests;
    const dossier = await draftDossier(analyze(tape, Date.parse(tape.measuredAt)), channelId, r.client, undefined, {
      bundle: recordedBundle(channelId)!,
      windows: recordedWindows,
    });
    expect(r.client.stats.requests).toBe(before);
    return dossier;
  }
  it("attaches v2 raw evidence and replays unpaid forced claims entirely offline", async () => {
    const d = await draft();
    expect(d.verifier.bundle.version).toBe(2);
    expect(d.evidence.settlement).toBeNull();
    expect(d.priority).toBeNull();
    expect(d.blockWindow?.remainingBlocks).toBe(364396);
    expect(d.verifier.report).toEqual(await verifyEvidence(d.verifier.bundle));
    expect((await replayDossier(JSON.parse(JSON.stringify(d)))).windowMatches).toBe(true);
    expect(dossierMarkdown(d)).toContain(d.sha256);
    expect(dossierMarkdown(d)).toContain(JSON.stringify(d, null, 2));
  });
  it("rejects tampering, forged derived windows and bundles attached to the wrong channel", async () => {
    const d = await draft();
    await expect(replayDossier({ ...d, channelId: "0x" + "a".repeat(64) })).rejects.toThrow("hash mismatch");
    const { sha256: _hash, ...raw } = d;
    await expect(
      replayDossier(await sealDossier({ ...raw, blockWindow: { ...d.blockWindow!, status: "closed" } })),
    ).rejects.toThrow("window differs");
    const bundle = await sealEvidence({ ...d.verifier.bundle, channelId: "0x" + "a".repeat(64) });
    await expect(replayDossier(await sealDossier({ ...raw, verifier: { ...d.verifier, bundle } }))).rejects.toThrow(
      "binding",
    );
    await expect(replayDossier({})).rejects.toThrow("Unsupported");
  });
  it("does not accept edited check results even when the outer hash is recomputed", async () => {
    const d = await draft();
    const { sha256: _hash, ...raw } = d;
    raw.verifier.report.checks[0]!.status = "PASS";
    raw.verifier.report.checks[0]!.detail = "Invented verdict";
    await expect(replayDossier(await sealDossier(raw))).rejects.toThrow("result differs");
  });
});
