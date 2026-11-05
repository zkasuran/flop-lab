// SPDX-License-Identifier: Apache-2.0
import snapshot from "../fixtures/snapshot-04.json";
import reliability from "../fixtures/reliability-04.json";
import { parseSnapshot, rankSnapshot, parseReliability } from "../src/index";
import seed from "../../recorder/test/fixtures/seed/snapshots/2026/11/05/21-23-37.342Z-6d4ce0af9956856d65c2025259b7f6b4cd63e8b2897b5c6a6f3c141b225c7d81.json";
console.log(JSON.stringify({ recorderIndexer: seed.observations.indexer }));
const input = parseSnapshot({ ...snapshot, reliability });
const view = parseReliability(reliability);
console.log(
  JSON.stringify(
    {
      measuredAt: reliability.measuredAt,
      source: reliability.source,
      from: new Date(reliability.from).toISOString(),
      to: new Date(reliability.to).toISOString(),
      summaries: view.summaries.length,
      periods: view.periods.length,
      events: view.events.length,
      ghosts: view.ghosts.length,
      proofs: view.proofs.length,
      eventKinds: [...new Set(view.events.map((e) => e.kind))],
      periodExample: view.periods[0],
      ghostExample: view.ghosts[0],
      top: rankSnapshot(input, { now: Date.parse(input.measuredAt) })
        .slice(0, 2)
        .map((r) => ({ miner: r.miner, score: r.score, terms: r.terms, status: r.reliability.ghostStatus })),
    },
    null,
    2,
  ),
);
