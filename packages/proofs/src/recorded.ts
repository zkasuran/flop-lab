// SPDX-License-Identifier: Apache-2.0
import manifest from "../fixtures/manifest.json";
import c0 from "../fixtures/capture-0.json";
import c1 from "../fixtures/capture-1.json";
import c2 from "../fixtures/capture-2.json";
import c3 from "../fixtures/capture-3.json";
import c4 from "../fixtures/capture-4.json";
import c5 from "../fixtures/capture-5.json";
import c6 from "../fixtures/capture-6.json";
import c7 from "../fixtures/capture-7.json";
import index from "../../recorder/test/fixtures/seed/index.json";
import { analyzeRecording } from "./report";
import { parseRecording } from "./model";
import { proofHistory } from "./history";

/** Replay the raw public recordings without network access. @example recordedProofs().stats */
export function recordedProofs() {
  return analyzeRecording(recordedInput());
}
/** Load the validated raw recording for export or inspection. @example recordedInput().captures */
export function recordedInput() {
  return parseRecording({ ...manifest, captures: [c0, c1, c2, c3, c4, c5, c6, c7] });
}
/** Load recorder seed observations. These close-spaced runs are not a daily trend. @example recordedHistory() */
export function recordedHistory() {
  return proofHistory(index);
}
