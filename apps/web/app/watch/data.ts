// SPDX-License-Identifier: Apache-2.0
import first from "../../../../packages/watch/test/fixtures/2026-11-06T04-45-55.439Z.json";
import second from "../../../../packages/watch/test/fixtures/2026-11-06T04-49-00.280Z.json";
import { parseSample, settlementPage } from "../../../../packages/watch/src/observations";
import { replay } from "../../../../packages/watch/src/engine";
import { example, parseConfig, type Config } from "../../../../packages/watch/src/config";
import { parseStats } from "@flop-lab/mcp";

const samples = [first, second].map(parseSample);
export const initialConfig = example;
export const recordedAddress = settlementPage(samples[0]!.observations.find((o) => o.key === "settlements")!.raw!)
  .rows[0]!.agent;
/** Project the recorded polls without passing raw responses into the browser. @example recordedReplay(config) */
export function recordedReplay(config: Config) {
  const results = replay(parseConfig(config), samples);
  return {
    mode: "recorded" as const,
    day: samples[0]!.startedAt.slice(0, 10),
    startedAt: samples[0]!.startedAt,
    finishedAt: samples.at(-1)!.finishedAt,
    requests: samples.reduce((sum, sample) => sum + sample.requests, 0),
    polls: samples.map((sample, i) => ({
      startedAt: sample.startedAt,
      finishedAt: sample.finishedAt,
      requests: sample.requests,
      observations: sample.observations.map((o) => ({
        key: o.key,
        source: o.source,
        measuredAt: o.measuredAt,
        status: o.status,
        error: o.error,
      })),
      head: parseStats(JSON.parse(sample.observations.find((o) => o.key === "stats")!.raw!)).latestBlockNumber,
      alerts: results[i]!.alerts,
      notes: results[i]!.notes,
      recording: `https://github.com/zkasuran/flop-lab/blob/main/packages/watch/test/fixtures/${sample.startedAt.replaceAll(":", "-")}.json`,
    })),
  };
}
export type Replay = ReturnType<typeof recordedReplay>;
