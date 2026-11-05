// SPDX-License-Identifier: Apache-2.0
// Import only browser-safe modules. Collection stays on the server.
export { MAX_BUNDLE_BYTES, parseEvidence } from "../../../../packages/verifier/src/bundle";
export { verifyEvidence } from "../../../../packages/verifier/src/checks/index";
export type { Check, Evidence, Observation, Report, Status } from "../../../../packages/verifier/src/types";

/** Validate a channel before any request. Example: channelInput(input.value). */
export function channelInput(value: string): string {
  const id = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(id)) throw new Error("Use a channel id with 0x followed by 64 hexadecimal characters.");
  return id;
}

/** Validate the recent-list network boundary. Example: recentInput(await response.json()). */
export function recentInput(value: unknown): { channelIds: string[]; capturedAt: string; source: string } {
  if (!value || typeof value !== "object") throw new Error("Invalid recent settlements response.");
  const data = value as Record<string, unknown>;
  if (
    !Array.isArray(data.channelIds) ||
    data.channelIds.length > 6 ||
    data.channelIds.some((id) => typeof id !== "string") ||
    typeof data.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(data.capturedAt)) ||
    data.source !== "https://mcp.flop.network/mcp"
  )
    throw new Error("Invalid recent settlements response.");
  const channelIds = data.channelIds.map((id) => channelInput(String(id)));
  if (new Set(channelIds).size !== channelIds.length) throw new Error("Duplicate recent channels.");
  return { channelIds, capturedAt: data.capturedAt, source: data.source };
}
