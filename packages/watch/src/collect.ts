// SPDX-License-Identifier: Apache-2.0
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { getStats, listSettlements, readIndexer, DEFAULT_URL } from "@flop-lab/mcp";
import { Transport } from "@flop-lab/harness";
import type { Config } from "./config";
import { readBounded } from "./runtime";
import { parseSample, validateObservation, type Key, type Observation, type Sample } from "./observations";

const GATEWAY = "https://api.flop.network/v1/models";
/** Collector with a run-wide physical request budget and a poll-interval cache.
 * @example const collector = createCollector(config); await collector.collect()
 */
export function createCollector(
  config: Config,
  options: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
) {
  const transport = new Transport({ maxRequests: config.maxRequests, timeoutMs: 8000, intervalMs: 300, ...options }),
    now = options.now ?? Date.now;
  let cached: Sample | null = null,
    pending: Promise<Sample> | null = null,
    cachedAt = 0;
  async function run(): Promise<Sample> {
    const start = now(),
      before = transport.requests,
      observations: Observation[] = [];
    transport.evidence.length = 0;
    async function observe(key: Key, source: string, load: () => Promise<string>, network = true) {
      const count = transport.evidence.length;
      let raw: string | null = null;
      try {
        if (network && transport.exhausted) {
          observations.push({
            key,
            source,
            measuredAt: new Date(now()).toISOString(),
            raw: null,
            status: "budget",
            error: "Run request budget exhausted",
          });
          return;
        }
        raw = await load();
        const o: Observation = {
          key,
          source,
          measuredAt: new Date(now()).toISOString(),
          raw,
          status: "ok",
          error: null,
        };
        validateObservation(o);
        observations.push(o);
      } catch (error) {
        const evidence = transport.evidence.slice(count),
          last = evidence.at(-1);
        const down = raw === null && last && (last.status === null || last.status >= 500);
        observations.push({
          key,
          source,
          measuredAt: new Date(now()).toISOString(),
          raw,
          status: down ? "down" : "unknown",
          error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
        });
      }
    }
    const rules = config.rules;
    if (
      rules.some(
        (r) =>
          r.kind === "devnet-reset" ||
          r.kind === "challenge-closing" ||
          (r.kind === "service-down" && r.service === "mcp"),
      )
    )
      await observe("stats", DEFAULT_URL, async () => (await getStats(transport.client)).raw);
    if (rules.some((r) => r.kind === "settlement"))
      await observe(
        "settlements",
        DEFAULT_URL,
        async () => (await listSettlements(transport.client, { limit: 50 })).raw,
      );
    if (rules.some((r) => r.kind === "challenge-closing"))
      await observe(
        "channels",
        DEFAULT_URL,
        async () => (await readIndexer(transport.client, "computeChannels", { limit: 50 })).raw,
      );
    if (rules.some((r) => r.kind === "price-expired" || (r.kind === "service-down" && r.service === "gateway")))
      await observe("models", GATEWAY, async () => {
        await transport.models();
        return transport.evidence.at(-1)!.response;
      });
    for (const report of new Set(rules.filter((r) => r.kind === "claim-change").map((r) => r.report!)))
      await observe(
        `harness:${report}`,
        pathToFileURL(resolve(report)).href,
        async () => {
          return readBounded(report, 196_608);
        },
        false,
      );
    cached = parseSample({
      version: 1,
      startedAt: new Date(start).toISOString(),
      finishedAt: new Date(now()).toISOString(),
      requests: transport.requests - before,
      observations,
    });
    cachedAt = now();
    return cached;
  }
  return {
    transport,
    collect(): Promise<Sample> {
      if (pending) return pending;
      if (cached && now() - cachedAt < config.pollMs) return Promise.resolve(cached);
      pending = run().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}
