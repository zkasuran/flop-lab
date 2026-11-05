// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Collector, rankSnapshot, parseSnapshot, sensitivity } from "../src/index";
import first from "../fixtures/snapshot-01.json";
import second from "../fixtures/snapshot-02.json";
import third from "../fixtures/snapshot-03.json";
import fourth from "../fixtures/snapshot-04.json";
const samples: number[] = [];
for (let i = 0; i < 10; i++) {
  const start = performance.now();
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("../dist/cli.js", import.meta.url)),
      "rank",
      "--file",
      fileURLToPath(new URL("../fixtures/snapshot-04.json", import.meta.url)),
      "--reliability-file",
      fileURLToPath(new URL("../fixtures/reliability-04.json", import.meta.url)),
      "--now",
      fourth.measuredAt,
      "--json",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  samples.push(performance.now() - start);
}
const collector = new Collector();
const live = await collector.snapshot();
const before = collector.stats.requests;
await collector.snapshot();
const liveRanks = rankSnapshot(live);
const sorted = [...samples].sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      source:
        "local built CLI against snapshot-04 and reliability-04; live collector against public gateway, hosted MCP and recorder archive",
      node: process.version,
      coldStartMs: samples,
      coldMedianMs: (sorted[4]! + sorted[5]!) / 2,
      offlineRequests: 0,
      liveCollection: live.collection,
      liveReliability: live.reliability
        ? {
            source: live.reliability.source,
            measuredAt: live.reliability.measuredAt,
            miners: live.reliability.miners.length,
          }
        : live.reliabilityError,
      liveArchive: live.archive,
      cachedAdditionalRequests: collector.stats.requests - before,
      snapshots: [first, second, third].map((s) => ({ measuredAt: s.measuredAt, ...s.collection })),
      liveSample: {
        totalCandidates: liveRanks.length,
        scoredCandidates: liveRanks.filter((r) => r.score !== null).length,
      },
      sensitivity: sensitivity(parseSnapshot(first), { now: Date.parse(first.measuredAt) }),
    },
    null,
    2,
  ),
);
