// SPDX-License-Identifier: Apache-2.0
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { McpClient, type Settlement } from "@flop-lab/mcp";
import {
  classifyCapture,
  classifyChannel,
  collectSessions,
  cachedCollector,
  recorderSample,
  transitions,
  parseCapture,
} from "../src/index";
import { loadCapture } from "../src/io";
import { parsePage, source, type Channel, type Observation } from "../src/schema";
const fixture = resolve(import.meta.dirname, "fixtures/live");
const capture = await loadCapture(fixture);
const report = classifyCapture(capture);
const open = report.sessions.find((s) => s.state === "open")!;
const paid = report.sessions.find((s) => s.state === "cooperative")!;
const forced = report.sessions.find((s) => s.channel?.status === "settling")!;
const co = capture.observations.find((o) => o.kind === "channels")!;
const so = capture.observations.find((o) => o.kind === "settlements")!;
function classify(channel: Partial<Channel>, settlement: Partial<Settlement> | null = null) {
  return classifyChannel(
    { value: { ...open.channel!, ...channel }, observation: co },
    settlement ? { value: { ...paid.settlement!, channelId: open.channelId, ...settlement }, observation: so } : null,
  );
}
function empty(kind: Observation["kind"]): Observation {
  const value = { data: [], pagination: { total: 0, limit: 50, offset: 0, hasMore: false } };
  return { ...co, kind, raw: JSON.stringify(kind === "channels" ? { computeChannels: value } : value) };
}
describe("recorded observations", () => {
  it("classifies the full recorded union without counting a channel twice", () => {
    expect(report.channels).toMatchObject({ rows: 624, total: 624, complete: true });
    expect(report.settlements).toMatchObject({ rows: 347, total: 347, complete: true });
    expect(report.counts).toEqual({
      opening: 0,
      open: 5,
      cooperative: 347,
      "challenge-window": 10,
      disputed: 0,
      finalized: 0,
      refunded: 262,
      unknown: 0,
    });
    expect(report.sessions).toHaveLength(624);
    expect(report.offers).toMatchObject({ rows: 0, total: 0, complete: true });
    expect(forced.evidence[0]?.fields.challengeEnd).toBe(3498640);
  });
  it("keeps each raw response below the fixture ceiling", async () => {
    for (const name of await readdir(resolve(fixture, ".."))) {
      if (name.endsWith(".json")) expect((await stat(resolve(fixture, "..", name))).size).toBeLessThan(200_000);
    }
    for (const name of await readdir(fixture)) expect((await stat(resolve(fixture, name))).size).toBeLessThan(200_000);
  });
  it("replays original tool text through the one MCP transport", async () => {
    const expected = [...capture.observations];
    const calls: string[] = [];
    const client = new McpClient({
      retries: 0,
      minIntervalMs: 0,
      fetch: async (_url, init) => {
        const request = JSON.parse(String(init?.body)) as {
          id: number;
          params: { name: string; arguments: Record<string, unknown> };
        };
        const o = expected.shift()!;
        calls.push(request.params.name);
        expect(request.params.name).toBe(
          o.kind === "channels"
            ? "flop_indexer_query"
            : o.kind === "settlements"
              ? "flop_list_settlements"
              : "flop_list_session_offers",
        );
        const args =
          o.kind === "channels"
            ? (request.params.arguments.variables as Record<string, unknown>)
            : request.params.arguments;
        expect(args).toMatchObject({ offset: o.offset, limit: 50 });
        return new Response(
          `data: ${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: o.raw }] } })}\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const replay = await collectSessions({ client });
    expect(classifyCapture(replay).counts).toEqual(report.counts);
    expect(calls).toHaveLength(capture.requests);
    expect(expected).toHaveLength(0);
  });
  it("quotes pinned section 12 rather than treating documentation as runtime state", async () => {
    const sources = JSON.parse(await readFile(resolve(fixture, "../lifecycle-sources.json"), "utf8")) as {
      raw: string;
    }[];
    const paper = sources[0]!.raw.replace(/\s+/g, " ");
    for (const t of transitions.filter((t) => t.source.includes("github.com"))) expect(paper).toContain(t.quote);
  });
});
describe("lifecycle decisions using labelled synthetic edge cases", () => {
  it("requires acknowledgement before open and does not invent off-chain usage", () => {
    expect(classify({ status: "PendingAck" }).state).toBe("opening");
    expect(classify({ status: "open", aggregateGn: "99" }).state).toBe("open");
  });
  it("does not convert forced claims or expired deadlines into finalisation", () => {
    expect(classify({ ...forced.channel!, challengeEnd: 1 }).state).toBe("challenge-window");
    expect(classify({ ...forced.channel!, challengeEnd: null }).state).toBe("unknown");
    expect(classify({ status: "settled", cooperative: false }).state).toBe("unknown");
    expect(classify({ status: "finalized", cooperative: false }).state).toBe("finalized");
  });
  it("keeps cooperative payout out of the forced challenge lane", () => {
    expect(classify({ status: "settled", cooperative: true, challengeEnd: 1 }).state).toBe("cooperative");
    expect(classify({ status: "forcesettled", cooperative: true }).state).toBe("unknown");
    expect(classify({ ...forced.channel!, channelId: open.channelId, statusBlockNumber: 99999999 }, {}).state).toBe(
      "unknown",
    );
  });
  it("requires explicit events for tape-only unilateral settlement", () => {
    const s = { ...paid.settlement!, cooperative: false };
    expect(classifyChannel(null, { value: s, observation: so }).state).toBe("unknown");
    expect(
      classifyChannel(null, { value: { ...s, settlementEvent: "computeChannel.ForceSettled" }, observation: so }).state,
    ).toBe("challenge-window");
    expect(
      classifyChannel(null, { value: { ...s, settlementEvent: "computeChannel.Finalized" }, observation: so }).state,
    ).toBe("finalized");
  });
  it("preserves disputes and refunds without inferring a verdict or amount", () => {
    expect(classify({ status: "disputed" }).state).toBe("disputed");
    for (const status of ["timedout", "expired", "voided", "refunded"])
      expect(classify({ status }).state).toBe("refunded");
  });
  it("fails closed on contradictory and unsupported evidence", () => {
    expect(classify({ status: "open" }, {}).state).toBe("unknown");
    expect(classify({ status: "settled", cooperative: false }, {}).state).toBe("unknown");
    expect(classify({ status: "future-upgrade" }, {}).state).toBe("unknown");
    expect(() => classify({}, { channelId: paid.channelId })).toThrow("IDs differ");
    expect(() => classifyChannel(null, null)).toThrow("No channel evidence");
  });
});
describe("empty, partial and hostile inputs", () => {
  it("separates a measured empty set from unavailable sources", () => {
    expect(classifyCapture({ ...capture, observations: [empty("channels"), empty("settlements")] }).counts).toEqual(
      Object.fromEntries(Object.keys(report.counts!).map((k) => [k, 0])),
    );
    expect(classifyCapture({ ...capture, observations: [] }).counts).toBeNull();
  });
  it("detects duplicate pages and partial coverage", () => {
    const r = classifyCapture({ ...capture, observations: [co, co] });
    expect(r.channels.complete).toBe(false);
    expect(r.sessions.every((s) => s.state === "unknown")).toBe(true);
    const partial = classifyCapture({ ...capture, observations: [so] });
    expect(partial.channels.total).toBeNull();
    expect(partial.settlements.complete).toBe(false);
  });
  it("rejects false pagination, unsafe blocks and invalid boundaries", () => {
    const raw = JSON.parse(co.raw!) as { computeChannels: { data: Channel[]; pagination: { hasMore: boolean } } };
    raw.computeChannels.pagination.hasMore = false;
    expect(() => parsePage({ ...co, raw: JSON.stringify(raw) })).toThrow("pagination");
    raw.computeChannels.data[0]!.challengeEnd = -1;
    expect(() => parsePage({ ...co, raw: JSON.stringify(raw) })).toThrow();
    expect(() => parseCapture({ ...capture, observations: [{ ...co, source: "https://other.test" }] })).toThrow();
    expect(() => parseCapture({ ...capture, observations: [{ ...co, measuredAt: "yesterday" }] })).toThrow();
    expect(() => parseCapture({ ...capture, observations: [{ ...co, raw: "x".repeat(190_001) }] })).toThrow();
    expect(() => parseCapture({ ...capture, finishedAt: "2020-01-01T00:00:00.000Z" })).toThrow();
  });
  it("stops a failed source and returns unavailable instead of looping", async () => {
    const client = new McpClient({
      retries: 0,
      minIntervalMs: 0,
      fetch: async () => new Response("offline", { status: 503 }),
    });
    const r = await collectSessions({ client });
    expect(r.requests).toBe(3);
    expect(classifyCapture(r).counts).toBeNull();
    await expect(collectSessions({ maxPages: 21 })).rejects.toThrow();
  });
  it("caches within TTL and coalesces callers", async () => {
    let calls = 0,
      now = 0;
    const load = cachedCollector(
      async () => {
        calls++;
        return capture;
      },
      60,
      () => now,
    );
    await Promise.all([load(), load()]);
    expect(calls).toBe(1);
    now = 61;
    await load();
    expect(calls).toBe(2);
  });
  it("honours the page budget without claiming completeness", async () => {
    const rows = [co, so, capture.observations.at(-1)!];
    const client = new McpClient({
      retries: 0,
      minIntervalMs: 0,
      fetch: async (_url, init) => {
        const { id } = JSON.parse(String(init?.body)) as { id: number };
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: rows.shift()!.raw }] } }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const c = await collectSessions({ client, maxPages: 1 });
    expect(c.requests).toBe(3);
    expect(classifyCapture(c).channels.complete).toBe(false);
  });
});
describe("recorder history", () => {
  it("counts only sampled settlements and preserves unavailable channel history", async () => {
    const dir = resolve(import.meta.dirname, "../../recorder/test/fixtures/seed/snapshots/2026/11/05");
    for (const name of await readdir(dir)) {
      const r = await recorderSample(JSON.parse(await readFile(resolve(dir, name), "utf8")) as unknown);
      expect(r.sessions).toHaveLength(5);
      expect(r.counts?.cooperative).toBe(5);
      expect(r.channels.total).toBeNull();
      expect(r.settlements.complete).toBe(false);
      expect(r.sessions[0]?.evidence[0]?.source).toBe(source);
    }
  });
  it("rejects a tampered recorder digest", async () => {
    await expect(recorderSample({ version: 1, id: "f".repeat(64) })).rejects.toThrow();
  });
});
it.skipIf(process.env.FLOP_LIVE !== "1")(
  "optional bounded live read",
  async () => {
    const c = await collectSessions({ maxPages: 1 });
    expect(classifyCapture(c).source).toBe(source);
  },
  60_000,
);
