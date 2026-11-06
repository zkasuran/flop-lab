// SPDX-License-Identifier: Apache-2.0
import { createMonitor } from "../../../../packages/finality/src/collect";
import { parseRecording } from "../../../../packages/finality/src/schema";
import recorded from "../../../../packages/finality/test/fixtures/observation.json";

export const readLive = createMonitor();
/** Retain the original date when the public source is unavailable. @example await initialObservation() */
export async function initialObservation() {
  try {
    return { recording: await readLive(), mode: "observed" as const, error: null, checkedAt: new Date().toISOString() };
  } catch (e) {
    return {
      recording: parseRecording(recorded),
      mode: "recorded-fixture" as const,
      error: e instanceof Error ? e.message : String(e),
      checkedAt: new Date().toISOString(),
    };
  }
}
