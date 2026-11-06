// SPDX-License-Identifier: Apache-2.0
import windows from "../fixtures/windows/capture.json";
import paid from "../fixtures/windows/paid-bundle.json";
import forced from "../fixtures/windows/forced-bundle.json";
import { parseEvidence, sealEvidence, type Evidence } from "../../verifier/src/index";
import type { WindowCapture } from "./windows";

export const recordedWindows: WindowCapture = windows;

/** Select an exact recorded channel bundle. Never relabel evidence from another channel.
 * @example const bundle = recordedBundle(channelId)
 */
export function recordedBundle(id: string): Evidence | undefined {
  const bundle = [paid, forced].find((b) => b.channelId === id);
  return bundle ? parseEvidence(bundle) : undefined;
}

/** Preserve an explicit empty evidence bundle when no recording exists for this channel.
 * @example const bundle = await recordedEvidence(channelId)
 */
export async function recordedEvidence(id: string): Promise<Evidence> {
  return (
    recordedBundle(id) ??
    sealEvidence({ version: 2, network: "flop-devnet", channelId: id, capturedAt: paid.capturedAt, observations: [] })
  );
}
