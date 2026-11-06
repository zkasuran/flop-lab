// SPDX-License-Identifier: Apache-2.0
import { McpClient } from "@flop-lab/mcp";
import { GATEWAY, MCP, parseDiscovery, parseGateway } from "./schema";
import type { Observation, Recording } from "./schema";

export const CACHE_TTL_MS = 30_000;
export const MAX_DETAIL_MODELS = 20;

async function boundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty gateway body");
  let size = 0,
    raw = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return raw + decoder.decode();
      size += chunk.value.byteLength;
      if (size > 190_000) throw new Error("Gateway response exceeds byte limit");
      raw += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
}

/** Create a coalescing collector with a fixed TTL and bounded retries. @example const collect = createCollector(); await collect(); */
export function createCollector(
  options: { fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
) {
  const fetcher = options.fetch ?? fetch,
    now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let cached: Recording | null = null,
    pending: Promise<Recording> | null = null,
    cachedAt = 0;
  async function run(): Promise<Recording> {
    const start = now(),
      observations: Observation[] = [];
    let requests = 0;
    const c = new McpClient({
      fetch: (url, init) =>
        fetcher(url, {
          ...init,
          signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(8000)]),
        }),
      retries: 1,
      timeoutMs: 8000,
      minIntervalMs: 300,
      now,
      sleep,
    });
    async function observe(key: string, source: string, call: () => Promise<string>) {
      try {
        const raw = await call();
        if (new TextEncoder().encode(raw).byteLength > 190_000) throw new Error("Source response exceeds byte limit");
        observations.push({ key, source, measuredAt: new Date(now()).toISOString(), raw, error: null });
        return JSON.parse(raw) as unknown;
      } catch (error) {
        if (!observations.some((o) => o.key === key))
          observations.push({
            key,
            source,
            measuredAt: new Date(now()).toISOString(),
            raw: null,
            error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
          });
        return null;
      }
    }
    async function gateway() {
      for (let attempt = 0; attempt < 2; attempt++) {
        requests++;
        const response = await fetcher(GATEWAY, {
          headers: { "User-Agent": "flop-lab-models/0.1 (+https://github.com/zkasuran/flop-lab)" },
          signal: AbortSignal.timeout(20000),
          cache: "no-store",
        });
        if (response.ok) return boundedText(response);
        await response.body?.cancel();
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
          const retry = Number(response.headers.get("retry-after"));
          await sleep(Math.max(500, Number.isFinite(retry) ? Math.min(retry * 1000, 30_000) : 500));
        } else throw new Error(`Gateway HTTP ${response.status}`);
      }
      throw new Error("Gateway retry budget exhausted");
    }
    const tool = (key: string, name: string, args: Record<string, unknown> = {}) =>
      observe(key, MCP, async () => (await c.callTool(name, args)).raw);
    const g = await observe("gateway", GATEWAY, gateway);
    const d = await tool("discover", "flop_discover_models", { max_results: 1000 });
    await tool("trust", "flop_trust_root");
    await tool("providers", "flop_list_providers");
    let gatewayModels: ReturnType<typeof parseGateway> = [],
      registry: ReturnType<typeof parseDiscovery>["models"] = [];
    try {
      gatewayModels = parseGateway(g);
    } catch {
      /* Catalogue reports the invalid source. */
    }
    try {
      registry = parseDiscovery(d).models;
    } catch {
      /* Catalogue reports the invalid source. */
    }
    const ids = [
      ...gatewayModels.map((m) => m.id),
      ...registry
        .filter((r) => !gatewayModels.some((m) => m.registryName.toLowerCase() === r.name.toLowerCase()))
        .map((m) => m.hash),
    ].slice(0, MAX_DETAIL_MODELS);
    for (const id of ids) {
      await tool(`info:${id}`, "flop_get_model_info", { model_id: id });
      await tool(`pricing:${id}`, "flop_get_model_pricing", { model_id: id });
    }
    if (ids.length) await tool("compare", "flop_compare_pricing", { models: ids, tokens_estimate: 1000 });
    cachedAt = now();
    cached = {
      version: 1,
      startedAt: new Date(start).toISOString(),
      completedAt: new Date(cachedAt).toISOString(),
      durationMs: cachedAt - start,
      requests: requests + c.stats.requests,
      observations,
    };
    return cached;
  }
  return async (): Promise<Recording> => {
    if (cached && now() - cachedAt >= 0 && now() - cachedAt < CACHE_TTL_MS) return cached;
    if (!pending)
      pending = run().finally(() => {
        pending = null;
      });
    return pending;
  };
}
