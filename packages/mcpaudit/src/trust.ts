// SPDX-License-Identifier: Apache-2.0
import type { TrustInspection } from "./types";
import reference from "../fixtures/intel-reference.json";

/** Inspect published material without treating its presence as attestation proof. @example inspectTrust({}, {}, "2026-01-01T00:00:00Z") */
export function inspectTrust(root: unknown, tcb: unknown, measuredAt: string | null): TrustInspection {
  const data = root && typeof root === "object" && !Array.isArray(root) ? (root as Record<string, unknown>) : {};
  const missing: string[] = [];
  const version = data.version ?? null;
  const snapshotHash = data.snapshotHash ?? data.snapshot_hash ?? null;
  const models = data.models ?? null;
  const dstackVkeys = data.dstackVkeys ?? null;
  const platforms = Array.isArray(models)
    ? models.map((model: unknown) => {
        const row = model && typeof model === "object" ? (model as Record<string, unknown>) : {};
        return { modelHash: row.modelHash ?? null, platformIds: row.supportedTeePlatforms ?? null };
      })
    : null;
  if (version === null) missing.push("No trust-root version was returned.");
  if (!snapshotHash) missing.push("No snapshot hash was returned.");
  if (!dstackVkeys || typeof dstackVkeys !== "object" || Object.keys(dstackVkeys).length === 0)
    missing.push(
      "No dstack verification keys were returned. A dstack quote cannot be checked against this response alone.",
    );
  if (!platforms) missing.push("No per-model TEE platform list was returned in the trust root.");
  else
    missing.push(
      "Platform ids are shown as returned. This response does not provide a versioned id-to-platform-name mapping.",
    );
  missing.push(
    "A trusted signing root, signed platform collateral and a real quote bound to an inference session are still required.",
  );
  const status = tcb && typeof tcb === "object" ? (tcb as Record<string, unknown>) : {};
  const latest =
    status.latestTCB && typeof status.latestTCB === "object" ? (status.latestTCB as Record<string, unknown>) : {};
  const comparison: string[] = [];
  if (latest.advisory === reference.advisoryId && reference.intel) {
    comparison.push(
      `Intel ${reference.advisoryId}: original release ${reference.intel.originalRelease}, last revised ${reference.intel.lastRevised}. MCP latestTCB reports ${String(latest.releaseDate)}.`,
    );
    if (latest.releaseDate !== reference.intel.originalRelease)
      comparison.push(
        "The reported release date does not match Intel's advisory. Treat this TCB metadata as inconsistent, not as evidence that a platform is current. Tracked upstream in network #36.",
      );
    if (Array.isArray(status.securityAdvisories))
      for (const item of status.securityAdvisories) {
        if (item && typeof item === "object") {
          const advisory = item as Record<string, unknown>;
          if (advisory.id === reference.advisoryId && advisory.released !== reference.intel.originalRelease)
            comparison.push(
              `securityAdvisories reports ${String(advisory.released)} for the same id. Intel reports ${reference.intel.originalRelease}.`,
            );
        }
      }
  } else comparison.push("No recorded Intel reference matches this TCB response. Advisory freshness is unverified.");
  comparison.push(
    "The Intel reference is a dated snapshot of this advisory, not the complete current Intel PCS collateral set. Platform-specific TCB validity is not checked.",
  );
  return {
    version,
    snapshotHash,
    models,
    dstackVkeys,
    platforms,
    tcb: tcb ?? null,
    missing,
    advisoryComparison: comparison,
    sources: [
      { url: "https://mcp.flop.network/mcp", measuredAt },
      ...reference.sources.map(({ url, measuredAt }) => ({ url, measuredAt })),
    ],
  };
}
