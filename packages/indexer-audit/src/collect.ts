// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_URL, McpClient, getComputeChannel, getStats, indexerQuery } from "@flop-lab/mcp";
import { auditSnapshot } from "./audit";
import { COUNTERS_QUERY, QUERY } from "./queries";
import type { AuditReport, Observation } from "./types";
import { integer, limitValue, object, rows, text } from "./validate";

const EXPLORER = "https://explorer.devnet.flop.network";
export interface AuditorOptions {
  fetch?: typeof fetch;
  /** Successful snapshots are reused by this instance for this many milliseconds. Default 30000. */
  cacheTtlMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Make a read-only auditor with a per-instance cache and a bounded retry budget.
 * @example const auditor = createAuditor(); const report = await auditor.run({ limit: 20 });
 */
export function createAuditor(options: AuditorOptions = {}) {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const ttl = options.cacheTtlMs ?? 30_000;
  if (!Number.isFinite(ttl) || ttl < 0 || ttl > 300_000) throw new Error("Cache TTL must be between 0 and 300000 ms");
  const cache = new Map<number, { expires: number; report: AuditReport }>();
  const pending = new Map<number, Promise<AuditReport>>();

  async function collect(limit: number): Promise<AuditReport> {
    const started = now();
    const observations: Observation[] = [];
    const requestBudget = 2 * (limit + 7);
    let requests = 0;
    let lastStart = -Infinity;
    const measured = () => new Date(now()).toISOString();
    const boundedFetch: typeof fetch = async (input, init) => {
      if (requests >= requestBudget) throw new Error("Audit request budget exhausted");
      const wait = 250 - (now() - lastStart);
      if (wait > 0) await sleep(wait);
      requests++;
      lastStart = now();
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 12_000);
      try {
        const signal = init?.signal ? AbortSignal.any([ctl.signal, init.signal]) : ctl.signal;
        const response = await doFetch(input, { ...init, signal, redirect: "error" });
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader) {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 200_000) {
              await reader.cancel();
              throw new Error("Response exceeds 200000 bytes");
            }
            chunks.push(chunk.value);
          }
        }
        const data = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.length;
        }
        return new Response(response.status === 204 || response.status === 304 ? null : data, {
          status: response.status,
          headers: response.headers,
        });
      } finally {
        clearTimeout(timer);
      }
    };
    const client = new McpClient({
      fetch: boundedFetch,
      retries: 1,
      timeoutMs: 12_000,
      minIntervalMs: 250,
      sleep,
      now,
    });
    const capture = async (
      id: string,
      source: string,
      request: Record<string, unknown>,
      call: () => Promise<{ raw: string; measuredAt: string }>,
    ) => {
      try {
        const result = await call();
        observations.push({ id, source, request, raw: result.raw, measuredAt: result.measuredAt });
      } catch (error) {
        observations.push({
          id,
          source,
          request,
          raw: null,
          measuredAt: measured(),
          error: (error instanceof Error ? error.message : String(error)).slice(0, 900),
        });
      }
    };
    const rest = async (id: string, path: string) =>
      capture(id, EXPLORER + path, { method: "GET" }, async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await boundedFetch(EXPLORER + path, {
            method: "GET",
            headers: {
              "User-Agent": "flop-lab/indexer-audit (+https://github.com/zkasuran/flop-lab)",
              Accept: "application/json",
            },
          });
          if ((response.status === 429 || response.status >= 500) && attempt === 0) {
            const ra = Number(response.headers.get("retry-after"));
            await sleep(Math.min(30_000, Math.max(500, Number.isFinite(ra) ? ra * 1000 : 500)));
            continue;
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const raw = await response.text();
          object(JSON.parse(raw));
          return { raw, measuredAt: measured() };
        }
        throw new Error("Explorer retries exhausted");
      });
    await capture("indexer", DEFAULT_URL, { tool: "flop_indexer_query", query: QUERY, variables: { limit } }, () =>
      indexerQuery(client, QUERY, { limit }),
    );
    await capture("stats", DEFAULT_URL, { tool: "flop_get_stats" }, () => getStats(client));
    await rest("explorer-stats", "/api/stats");
    await rest("staking", "/api/staking/stats");
    await rest("miners", `/api/miners?limit=${limit}`);
    let root: Record<string, unknown> | undefined;
    try {
      const raw = observations.find((o) => o.id === "indexer")?.raw;
      if (raw) root = object(JSON.parse(raw));
      if (root?.errors !== undefined) root = undefined;
    } catch {
      /* Missing data becomes UNVERIFIABLE in the evaluator. */
    }
    try {
      const block = rows(root?.blocks)[0];
      if (block) {
        const number = integer(block.number);
        await capture("block", DEFAULT_URL, { tool: "flop_get_block", number }, () =>
          client.callTool("flop_get_block", { number }),
        );
      }
    } catch {
      /* Invalid block rows do not generate lookups. */
    }
    try {
      const settlements = rows(object(root?.settlementPrices).data).slice(0, limit);
      for (const [i, row] of settlements.entries()) {
        let channelId: string;
        try {
          channelId = text(row.channelId);
          if (!/^0x[0-9a-fA-F]{64}$/.test(channelId)) continue;
        } catch {
          continue;
        }
        await capture(`channel-${i}`, DEFAULT_URL, { tool: "flop_get_compute_channel", channel_id: channelId }, () =>
          getComputeChannel(client, channelId),
        );
      }
    } catch {
      /* Malformed rows never trigger unbounded fan-out. */
    }
    await capture("counters-after", DEFAULT_URL, { tool: "flop_indexer_query", query: COUNTERS_QUERY }, () =>
      indexerQuery(client, COUNTERS_QUERY),
    );
    return auditSnapshot({
      version: 1,
      startedAt: new Date(started).toISOString(),
      completedAt: measured(),
      limit,
      requests,
      requestBudget,
      durationMs: Math.max(0, Math.round(now() - started)),
      observations,
    });
  }
  return {
    async run({ limit: input = 20 }: { limit?: number } = {}): Promise<AuditReport> {
      const limit = limitValue(input);
      const hit = cache.get(limit);
      if (hit && hit.expires > now()) return { ...structuredClone(hit.report), cached: true };
      let work = pending.get(limit);
      if (!work) {
        work = collect(limit);
        pending.set(limit, work);
      }
      try {
        const report = await work;
        if (report.snapshot.observations.every((o) => o.error === undefined))
          cache.set(limit, { report: structuredClone(report), expires: now() + ttl });
        return structuredClone(report);
      } finally {
        pending.delete(limit);
      }
    },
  };
}
