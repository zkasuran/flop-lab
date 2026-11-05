// SPDX-License-Identifier: Apache-2.0
import { parseSnapshot } from "../../../../packages/scoreboard/src/schema";
import first from "../../../../packages/scoreboard/fixtures/snapshot-01.json";
import second from "../../../../packages/scoreboard/fixtures/snapshot-02.json";
import third from "../../../../packages/scoreboard/fixtures/snapshot-03.json";
import { historyPoint, snapshotStore } from "./data";
import { collectSnapshot } from "./collect";

const recordings = [first, second, third].map(parseSnapshot);
export const recordedHistory = recordings.map(historyPoint);

/** Read live data or a dated last-good recording. Example: await readScoreboard(). */
export const readScoreboard = snapshotStore(collectSnapshot, recordings[2]!);
