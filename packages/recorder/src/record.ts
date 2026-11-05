// SPDX-License-Identifier: Apache-2.0
import { loadClaims, runHarness, Transport, type Evidence } from "@flop-lab/harness";
import {
  contentHash,
  GATEWAY,
  keys,
  MCP,
  object,
  seal,
  validateValue,
  type Json,
  type Key,
  type Observation,
  type Snapshot,
} from "./schema";

export const CLAIM_IDS = ["mcp-health", "price-source-expiry", "settlement-conservation"] as const;
export const STATS_QUERY =
  "{ stats { latestBlockNumber totalBlocks tps activeHTLCs totalHTLCs proofs24h activeOperators avgBlockTime totalTransactions txVolume24h totalAccounts flopLocked } block(number: 0) { number hash } }";
export const VALUE_QUERY = "{ networkValue { contributors effectiveCoalitions concentration models effectiveAgents } }";
export const REQUESTS = {
  stats: { name: "flop_get_stats", arguments: {} },
  health: { name: "flop_health", arguments: {} },
  settlements: { name: "flop_list_settlements", arguments: { limit: 5, offset: 0 } },
  poui: { name: "flop_get_poui_leaderboard", arguments: { limit: 5 } },
  trustRoot: { name: "flop_trust_root", arguments: {} },
  indexer: { name: "flop_indexer_query", arguments: { query: STATS_QUERY } },
  networkValue: { name: "flop_indexer_query", arguments: { query: VALUE_QUERY } },
} as const;

/** One bounded read-only run. No cross-run cache. @example await recordSnapshot() */
export async function recordSnapshot(
  options: { fetch?: typeof fetch; intervalMs?: number; timeoutMs?: number } = {},
): Promise<{ snapshot: Snapshot; evidence: Evidence[] }> {
  const start = Date.now();
  const transport = new Transport({ ...options, maxRequests: 16 });
  const harnessTransport = new Transport({ ...options, maxRequests: 8 });
  const observations = {} as Record<Key, Observation>;
  for (const key of keys) {
    const started = Date.now();
    const source =
      key === "models"
        ? GATEWAY
        : key === "harness"
          ? `flop-harness: ${CLAIM_IDS.join(",")} via ${MCP} and ${GATEWAY}`
          : `${MCP} ${JSON.stringify(REQUESTS[key])}`;
    try {
      let value: unknown;
      if (key === "models") value = await transport.models();
      else if (key === "harness") {
        const catalogue = new URL("../claims/", import.meta.resolve("@flop-lab/harness"));
        const claims = (await loadClaims(catalogue)).filter((claim) =>
          (CLAIM_IDS as readonly string[]).includes(claim.id),
        );
        if (claims.length !== CLAIM_IDS.length) throw new Error("Fixed harness claim set is incomplete");
        const report = await runHarness({ claims, maxFlop: "0", transport: harnessTransport });
        value = {
          requests: report.budget.requests,
          maxRequests: report.budget.maxRequests,
          claims: report.results.map((result) => ({
            id: result.claim.id,
            status: result.status,
            reason: result.reason.slice(0, 2000),
            measuredAt: result.attempts.at(-1)?.measuredAt ?? report.measuredAt,
            source: report.source.join(" "),
          })),
        };
      } else {
        const request = REQUESTS[key];
        value = (await transport.client.callTool(request.name, request.arguments)).value;
        if (key === "trustRoot") {
          const root = object(value);
          for (const name of ["dstackVkeys", "models", "pouiCommittee"])
            if (!Array.isArray(root[name])) throw new Error(`Missing trust root ${name}`);
          value = {
            digest: await contentHash(value),
            snapshotHash: root.snapshotHash,
            dstackVkeys: (root.dstackVkeys as Json[]).length,
            models: (root.models as Json[]).length,
            committee: (root.pouiCommittee as Json[]).length,
          };
        }
      }
      observations[key] = {
        source,
        measuredAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        status: "ok",
        value: validateValue(key, value),
        error: null,
      };
      // Keep large or growing sources from preventing a small partial snapshot.
      if (Buffer.byteLength(JSON.stringify(observations[key])) > 15_000)
        throw new Error("Source exceeds the 15 KB snapshot allocation");
      if (Buffer.byteLength(JSON.stringify(observations)) > 85_000)
        throw new Error("Source exceeds the remaining snapshot allocation");
    } catch (error) {
      observations[key] = {
        source,
        measuredAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        status: "unavailable",
        value: null,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
      };
    }
  }
  const snapshot = await seal({
    version: 1,
    startedAt: new Date(start).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    requests: transport.requests + harnessTransport.requests,
    maxRequests: 24,
    observations,
  });
  return { snapshot, evidence: [...transport.evidence, ...harnessTransport.evidence] };
}
