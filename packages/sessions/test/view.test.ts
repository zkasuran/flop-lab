// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { cards, report, history } from "../../../apps/web/app/sessions/data";
import { visibleChannels, traceState, parseDetail } from "../../../apps/web/app/sessions/view";
import { GET } from "../../../apps/web/app/sessions/channel/[id]/route";
it("keeps state and ID filters conjunctive without mutating recorded counts", () => {
  expect(visibleChannels(cards, "challenge-window", "")).toHaveLength(10);
  const card = cards.find((c) => c.state === "open")!;
  expect(visibleChannels(cards, "cooperative", card.id)).toHaveLength(0);
  expect(visibleChannels(cards, "all", card.id.toUpperCase())).toEqual([card]);
  expect(cards).toHaveLength(624);
});
it("replays the known endpoints without inventing an earlier snapshot", () => {
  const card = cards.find((c) => c.state === "challenge-window")!;
  expect(traceState(card, "opened")).toBe("open");
  expect(traceState(card, "latest")).toBe("challenge-window");
  expect(traceState({ ...card, openedBlock: null }, "opened")).toBe("challenge-window");
  expect(traceState({ ...card, state: "unknown" }, "opened")).toBe("unknown");
  expect(traceState({ ...card, state: "refunded", canReplayOpening: false }, "opened")).toBe("refunded");
});
it("keeps historical samples distinct from the current full crawl", async () => {
  const rows = await history();
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.rows === 5 && r.counts?.cooperative === 5)).toBe(true);
  expect(rows[0]!.measuredAt < rows[1]!.measuredAt).toBe(true);
});
it("validates drawer provenance and rejects hostile payloads", () => {
  const session = report.sessions[0]!;
  expect(parseDetail(session, session.channelId).state).toBe(session.state);
  expect(() => parseDetail({ ...session, state: "future" }, session.channelId)).toThrow();
  expect(() =>
    parseDetail(
      { ...session, evidence: [{ ...session.evidence[0], source: "https://invalid.test" }] },
      session.channelId,
    ),
  ).toThrow();
  expect(() =>
    parseDetail({ ...session, evidence: [{ ...session.evidence[0], fields: { unsafe: {} } }] }, session.channelId),
  ).toThrow();
});
it("serves only recorded channels and rejects malformed IDs", async () => {
  const request = new Request("http://localhost:3640/sessions/channel/test");
  expect((await GET(request, { params: Promise.resolve({ id: "bad" }) })).status).toBe(400);
  expect((await GET(request, { params: Promise.resolve({ id: `0x${"ff".repeat(32)}` }) })).status).toBe(404);
  const response = await GET(request, { params: Promise.resolve({ id: cards[0]!.id }) });
  expect(response.status).toBe(200);
  expect(parseDetail(await response.json(), cards[0]!.id).channelId).toBe(cards[0]!.id);
});
