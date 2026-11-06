// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_URL, McpClient } from "@flop-lab/mcp";
import { auditSnapshot, type Observation, type Snapshot } from "./observed";

/** Observe bounded public fields. Successful results cache per instance for 30 seconds.
 * @example const observer = createObserver(); const report = await observer.run()
 */
export function createObserver(
  options: { fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
) {
  const now = options.now ?? Date.now,
    sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let cached: { until: number; report: Awaited<ReturnType<typeof collect>> } | undefined;
  let pending: Promise<Awaited<ReturnType<typeof collect>>> | undefined;
  async function collect() {
    let requests = 0,
      last = -Infinity;
    const started = now();
    const boundedFetch: typeof fetch = async (input, init) => {
      if (requests >= 4) throw Error("Request budget exhausted");
      await sleep(Math.max(0, 500 - (now() - last)));
      last = now();
      requests++;
      const timeout = AbortSignal.timeout(12_000);
      const response = await (options.fetch ?? fetch)(input, {
        ...init,
        redirect: "error",
        signal: init?.signal ? AbortSignal.any([timeout, init.signal]) : timeout,
      });
      const reader = response.body?.getReader(),
        decoder = new TextDecoder();
      let raw = "",
        size = 0;
      if (reader)
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 200_000) {
            await reader.cancel();
            throw Error("Response exceeds 200000 bytes");
          }
          raw += decoder.decode(part.value, { stream: true });
        }
      raw += decoder.decode();
      return new Response([204, 304].includes(response.status) ? null : raw, {
        status: response.status,
        headers: response.headers,
      });
    };
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
    const client = new McpClient({
      fetch: boundedFetch,
      retries: 1,
      timeoutMs: 12_000,
      minIntervalMs: 500,
      now,
      sleep,
    });
    const stats = await capture(DEFAULT_URL, () => client.callTool("flop_get_stats"));
    const source = "https://explorer.devnet.flop.network/api/miners?limit=100";
    const miners = await capture(source, async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await boundedFetch(source, {
          headers: {
            Accept: "application/json",
            "User-Agent": "flop-lab/metering (+https://github.com/zkasuran/flop-lab)",
          },
        });
        if ((response.status === 429 || response.status >= 500) && attempt === 0) {
          const retry = Number(response.headers.get("retry-after"));
          await sleep(Number.isFinite(retry) ? Math.max(500, Math.min(30_000, retry * 1000)) : 500);
          continue;
        }
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        return { raw: await response.text(), measuredAt: new Date(now()).toISOString() };
      }
      throw Error("Retry budget exhausted");
    });
    const snapshot: Snapshot = { stats, miners };
    return {
      ...auditSnapshot(snapshot),
      snapshot,
      requests,
      durationMs: now() - started,
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
