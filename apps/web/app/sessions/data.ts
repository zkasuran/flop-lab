// SPDX-License-Identifier: Apache-2.0
import { classifyCapture } from "../../../../packages/sessions/src/classify";
import { recorderSample } from "../../../../packages/sessions/src/history";
import manifest from "../../../../packages/sessions/test/fixtures/live/manifest.json";
import p0 from "../../../../packages/sessions/test/fixtures/live/page-0.json";
import p1 from "../../../../packages/sessions/test/fixtures/live/page-1.json";
import p2 from "../../../../packages/sessions/test/fixtures/live/page-2.json";
import p3 from "../../../../packages/sessions/test/fixtures/live/page-3.json";
import p4 from "../../../../packages/sessions/test/fixtures/live/page-4.json";
import p5 from "../../../../packages/sessions/test/fixtures/live/page-5.json";
import p6 from "../../../../packages/sessions/test/fixtures/live/page-6.json";
import p7 from "../../../../packages/sessions/test/fixtures/live/page-7.json";
import p8 from "../../../../packages/sessions/test/fixtures/live/page-8.json";
import p9 from "../../../../packages/sessions/test/fixtures/live/page-9.json";
import p10 from "../../../../packages/sessions/test/fixtures/live/page-10.json";
import p11 from "../../../../packages/sessions/test/fixtures/live/page-11.json";
import p12 from "../../../../packages/sessions/test/fixtures/live/page-12.json";
import p13 from "../../../../packages/sessions/test/fixtures/live/page-13.json";
import p14 from "../../../../packages/sessions/test/fixtures/live/page-14.json";
import p15 from "../../../../packages/sessions/test/fixtures/live/page-15.json";
import p16 from "../../../../packages/sessions/test/fixtures/live/page-16.json";
import p17 from "../../../../packages/sessions/test/fixtures/live/page-17.json";
import p18 from "../../../../packages/sessions/test/fixtures/live/page-18.json";
import p19 from "../../../../packages/sessions/test/fixtures/live/page-19.json";
import p20 from "../../../../packages/sessions/test/fixtures/live/page-20.json";
import old0 from "../../../../packages/recorder/test/fixtures/seed/snapshots/2026/11/05/21-23-37.342Z-6d4ce0af9956856d65c2025259b7f6b4cd63e8b2897b5c6a6f3c141b225c7d81.json";
import old1 from "../../../../packages/recorder/test/fixtures/seed/snapshots/2026/11/05/21-24-20.273Z-bbf22ec5d76af626e448d855803f2e3eb1d3bd41444ce393a2927592b25c7f57.json";
import type { SessionCard } from "./view";

export const report = classifyCapture({
  ...manifest,
  observations: [p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15, p16, p17, p18, p19, p20],
});
export const cards: SessionCard[] = report.sessions.map((s) => ({
  id: s.channelId,
  state: s.state,
  openedBlock: s.channel?.openedBlock ?? null,
  openedAt: s.channel?.openedAt ?? null,
  statusBlock: s.channel?.statusBlockNumber ?? s.settlement?.settledBlock ?? null,
  updatedAt: s.channel?.updatedAt ?? s.settlement?.settledAt ?? null,
  canReplayOpening: ["open", "settled", "settling", "timedout", "finalized", "disputed", "forcesettled"].includes(
    s.channel?.status.toLowerCase().replace(/[_ -]/g, "") ?? "",
  ),
}));
export async function history() {
  return Promise.all(
    [old0, old1].map(async (input) => {
      const r = await recorderSample(input);
      return {
        measuredAt: r.measuredAt,
        counts: r.counts,
        rows: r.sessions.length,
        total: r.settlements.total,
        source: r.source,
      };
    }),
  );
}
