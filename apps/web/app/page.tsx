// SPDX-License-Identifier: Apache-2.0
import { AutoRefresh } from "@/components/landing/auto-refresh";
import { CheckStory } from "@/components/landing/check-story";
import { FindingsHighlights } from "@/components/landing/findings-highlights";
import { Hero } from "@/components/landing/hero";
import { SectionsBento } from "@/components/landing/sections-bento";
import { Quickstart, Signed } from "@/components/landing/start-and-sign";
import { SettlementTicker } from "@/components/landing/ticker";
import { ToolUniverse } from "@/components/landing/tool-universe";
import { getCachedSnapshot } from "@/lib/devnet-server";
import { readClaimRun, readSettlementTape } from "@/lib/evidence";
import { readStory } from "./about/recording";
import { languageMetadata } from "./zh/routes";

export const metadata = languageMetadata("/", "en");
export const revalidate = 30;
export default async function Home() {
  const snapshot = await getCachedSnapshot();
  const run = readClaimRun();
  const tape = readSettlementTape();
  const story = readStory();
  const first = tape.rows[0];
  return (
    <>
      <AutoRefresh />
      <Hero snapshot={snapshot} tape={tape} run={run} />
      <SettlementTicker tape={tape} />
      <SectionsBento />
      {first && (
        <CheckStory
          row={first}
          tape={{ measuredAt: tape.measuredAt, recording: tape.recording, source: tape.source, tool: tape.tool }}
        />
      )}
      <FindingsHighlights snapshot={snapshot} run={run} tape={tape} />
      <ToolUniverse />
      <Quickstart />
      <Signed story={story} />
    </>
  );
}
