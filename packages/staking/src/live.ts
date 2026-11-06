// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_URL, McpClient, readIndexer } from "@flop-lab/mcp";
import { auditStake, type Snapshot } from "./observed";
import { parameters } from "./recorded";
import type { Observation } from "./validate";

/** Create a bounded public observer. Successful snapshots cache for 30 seconds per instance.
 * @example const observer = createObserver(); const report = await observer.run()
 */
export function createObserver(
  options: { fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let cached: { until: number; report: Awaited<ReturnType<typeof collect>> } | undefined;
  let pending: Promise<Awaited<ReturnType<typeof collect>>> | undefined;
  async function collect() {
    let requests = 0,
      last = -Infinity;
    const start = now();
    const boundedFetch: typeof fetch = async (input, init) => {
      if (requests >= 6) throw new Error("Request budget exhausted");
      await sleep(Math.max(0, 500 - (now() - last)));
      requests++;
      last = now();
      const signal = AbortSignal.timeout(12_000);
      const response = await (options.fetch ?? fetch)(input, {
        ...init,
        redirect: "error",
        signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
      });
      const reader = response.body?.getReader();
      let raw = "",
        size = 0;
      const decoder = new TextDecoder();
      if (reader)
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 200_000) {
            await reader.cancel();
            throw new Error("Response exceeds 200000 bytes");
          }
          raw += decoder.decode(part.value, { stream: true });
        }
      raw += decoder.decode();
      return new Response(response.status === 204 || response.status === 304 ? null : raw, {
        status: response.status,
        headers: response.headers,
      });
    };
    const client = new McpClient({
      fetch: boundedFetch,
      retries: 1,
      minIntervalMs: 500,
      timeoutMs: 12_000,
      now,
      sleep,
    });
    const capture = async (
      source: string,
      call: () => Promise<{ raw: string; measuredAt: string }>,
    ): Promise<Observation> => {
      try {
        return { source, ...(await call()) };
      } catch (e) {
        return {
          source,
          measuredAt: new Date(now()).toISOString(),
          raw: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    };
    const rest = (path: string) => {
      const source = `https://explorer.devnet.flop.network${path}`;
      return capture(source, async () => {
        for (let i = 0; i < 2; i++) {
          const r = await boundedFetch(source, {
            headers: {
              "User-Agent": "flop-lab/staking (+https://github.com/zkasuran/flop-lab)",
              Accept: "application/json",
            },
          });
          if ((r.status === 429 || r.status >= 500) && i === 0) {
            const retryAfter = Number(r.headers.get("retry-after"));
            await sleep(Number.isFinite(retryAfter) ? Math.min(30_000, Math.max(500, retryAfter * 1000)) : 500);
            continue;
          }
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return { raw: await r.text(), measuredAt: new Date(now()).toISOString() };
        }
        throw new Error("Retry budget exhausted");
      });
    };
    const positions = await capture(DEFAULT_URL, () =>
      readIndexer(client, "sponsorPositions", { limit: 100, offset: 0 }),
    );
    const miners = await rest("/api/miners?limit=100");
    const stats = await rest("/api/staking/stats");
    const snapshot: Snapshot = { miners, positions, stats };
    return {
      ...auditStake(snapshot, parameters),
      snapshot,
      requests,
      durationMs: now() - start,
      cached: false,
      cacheTtlMs: 30_000,
    };
  }
  return {
    async run() {
      if (cached && cached.until > now()) return { ...structuredClone(cached.report), cached: true, requests: 0 };
      pending ??= collect();
      try {
        const report = await pending;
        if (!report.errors.length) cached = { until: now() + 30_000, report: structuredClone(report) };
        return structuredClone(report);
      } finally {
        pending = undefined;
      }
    },
  };
}
