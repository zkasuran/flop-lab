// SPDX-License-Identifier: Apache-2.0
import { collect, createMonitor } from "../../../../packages/finality/src/collect";
import { McpClient } from "@flop-lab/mcp";
import { publicFetch } from "../../lib/security/transport";
import { parseRecording } from "../../../../packages/finality/src/schema";
import recorded from "../../../../packages/finality/test/fixtures/observation.json";

export const readLive = createMonitor(() =>
  collect(new McpClient({ fetch: publicFetch, retries: 0, timeoutMs: 8000 })),
);
/** Retain the original date when the public source is unavailable. @example await initialObservation() */
export async function initialObservation() {
  try {
    return { recording: await readLive(), mode: "observed" as const, error: null, checkedAt: new Date().toISOString() };
  } catch {
    return {
      recording: parseRecording(recorded),
      mode: "recorded-fixture" as const,
      error: "Public observation unavailable",
      checkedAt: new Date().toISOString(),
    };
  }
}
