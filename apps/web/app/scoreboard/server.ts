// SPDX-License-Identifier: Apache-2.0
import { Collector } from "../../../../packages/scoreboard/src/collector";
import { parseSnapshot } from "../../../../packages/scoreboard/src/schema";
import first from "../../../../packages/scoreboard/fixtures/snapshot-01.json";
import second from "../../../../packages/scoreboard/fixtures/snapshot-02.json";
import third from "../../../../packages/scoreboard/fixtures/snapshot-03.json";
import { historyPoint, snapshotStore } from "./data";

const recordings = [first, second, third].map(parseSnapshot);
const collector = new Collector();
export const recordedHistory = recordings.map(historyPoint);

/** Read live data or a dated last-good recording. Example: await readScoreboard(). */
export const readScoreboard = snapshotStore(() => collector.snapshot(), recordings[2]!);
