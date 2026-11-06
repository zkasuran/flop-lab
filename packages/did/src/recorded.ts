// SPDX-License-Identifier: Apache-2.0
import noteSharded from "../fixtures/note-sharded.json";
import noteLegacy from "../fixtures/note-legacy.json";
import noteAgent from "../fixtures/note-agent.json";
import room from "../fixtures/room.json";
import github from "../fixtures/github.json";
import build from "../fixtures/build.json";
import attestation from "../fixtures/attestation-room.json";
import { parseObservation, type Reader } from "./trail";

export const recordings = [noteSharded, noteLegacy, noteAgent, room, github, build, attestation].map(parseObservation);

/** Offline read of a dated response, never a network fallback. Example: await collectTrail(did, recordedReader). */
export const recordedReader: Reader = async (url) => {
  const match = recordings.find((row) => row.source === url);
  if (!match) throw new Error("No recorded response for this URL");
  return match;
};
