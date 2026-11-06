// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { cards, report, history } from "./data";
import { SessionBoard } from "./board";
export const metadata: Metadata = {
  title: "Session lifecycle",
  description: "Trace compute channels from opening to their latest reported state with dated public evidence.",
};
export default async function SessionsPage() {
  return (
    <SessionBoard
      cards={cards}
      measuredAt={report.measuredAt}
      counts={report.counts}
      source={report.source}
      channelCoverage={report.channels}
      tapeCoverage={report.settlements}
      offers={report.offers}
      history={await history()}
    />
  );
}
