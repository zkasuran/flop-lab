// SPDX-License-Identifier: Apache-2.0
import recorderIndex from "../../recorder/test/fixtures/seed/index.json";
import { rawCapture } from "./data";
import type { Capture } from "./collect";
import { buildReport } from "./report";

/** Return raw bundled source responses. No network requests. @example recordedCapture().revisions */
export function recordedCapture(): Capture {
  // This generated local bundle contains the captured HTTP envelopes. Each consumer validates its boundary.
  return JSON.parse(rawCapture) as Capture;
}
/** Replay the dated timeline and bundled recorder index. @example recordedReport().events */
export function recordedReport() {
  return buildReport(recordedCapture(), {
    index: recorderIndex,
    evidence: {
      source: "https://github.com/zkasuran/flop-lab/blob/879a08a/packages/recorder/test/fixtures/seed/index.json",
      measuredAt: recorderIndex.entries.at(-1)!.measuredAt,
    },
  });
}
