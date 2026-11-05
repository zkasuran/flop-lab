// SPDX-License-Identifier: Apache-2.0
import { McpClient, DEFAULT_URL } from "@flop-lab/mcp";
import {
  estimateCalls,
  GATEWAY_URL,
  gatewayPrice,
  observation,
  validateInput,
  type EstimateInput,
  type GatewayPrice,
  type Observation,
} from "./core";
import { INTROSPECTION_QUERY, completions } from "./query";
import { object, parseTools, type Tool } from "./schema";

export const POLICY = {
  visitorBudget: 20,
  globalBudget: 100,
  windowMs: 60_000,
  cacheMs: 60_000,
  catalogMs: 300_000,
  timeoutMs: 20_000,
  responseBytes: 200_000,
} as const;
export class ConsoleError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export type Catalog = { tools: Tool[]; source: string; measuredAt: string };
export type Estimate = {
  input: EstimateInput;
  observations: Observation[];
  errors: { tool: string; message: string }[];
  gateway: GatewayPrice | null;
  gatewayError: string | null;
};
export type ConsoleRequest =
  | { action: "tools" }
  | { action: "introspect" }
  | { action: "call"; tool: string; args: Record<string, unknown> }
  | { action: "estimate"; input: EstimateInput };
export type Payload =
  | { kind: "tools"; catalog: Catalog }
  | { kind: "call"; observation: Observation }
  | { kind: "introspect"; observation: Observation; fields: ReturnType<typeof completions> }
  | { kind: "estimate"; estimate: Estimate };
export type ConsoleResponse = {
  payload: Payload;
  cached: boolean;
  servedAt: string;
  requests: number;
  budgetRemaining: number;
};

/** Parse the proxy envelope. @example parseRequest({action: "call", tool: "flop_get_stats", args: {}}) */
export function parseRequest(value: unknown): ConsoleRequest {
  const row = object(value);
  if (row.action === "tools" || row.action === "introspect") return { action: row.action };
  if (row.action === "call" && typeof row.tool === "string")
    return { action: "call", tool: row.tool, args: object(row.args) };
  if (row.action === "estimate") {
    const input = object(row.input);
    if (typeof input.model !== "string" || typeof input.tokens !== "number" || typeof input.outputTokens !== "number")
      throw new ConsoleError("Invalid estimate input");
    const parsed = { model: input.model, tokens: input.tokens, outputTokens: input.outputTokens };
    estimateCalls(parsed);
    return { action: "estimate", input: parsed };
  }
  throw new ConsoleError("Unknown console action");
}

/** Read response bytes under both a deadline and a hard size cap. @example boundedFetch(fetch, signal)(url) */
export function boundedFetch(transport: typeof fetch, signal: AbortSignal): typeof fetch {
  return async (url, init) => {
    const combined = AbortSignal.any([signal, AbortSignal.timeout(8000), ...(init?.signal ? [init.signal] : [])]);
    const response = await transport(url, { ...init, signal: combined });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty upstream body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const cancel = () => {
      void reader.cancel().catch(() => undefined);
    };
    combined.addEventListener("abort", cancel, { once: true });
    try {
      while (true) {
        combined.throwIfAborted();
        const chunk = await reader.read();
        combined.throwIfAborted();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > POLICY.responseBytes) {
          cancel();
          throw new Error("Upstream response exceeds byte limit");
        }
        chunks.push(chunk.value);
      }
    } finally {
      combined.removeEventListener("abort", cancel);
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, position);
      position += chunk.length;
    }
    return new Response(bytes, { status: response.status, headers: response.headers });
  };
}

/** In-memory fixed-window budget. New visitors cannot evict existing buckets. @example new Budget().take("visitor", 1, Date.now()) */
export class Budget {
  private buckets = new Map<string, { used: number; reset: number }>();
  take(key: string, cost: number, now: number, limit: number = POLICY.visitorBudget): number {
    for (const [id, bucket] of this.buckets) if (bucket.reset <= now) this.buckets.delete(id);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= 2000) throw new ConsoleError("Visitor budget store is full. Retry later.", 429);
      bucket = { used: 0, reset: now + POLICY.windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.used + cost > limit) throw new ConsoleError("Request budget exhausted. Retry after one minute.", 429);
    bucket.used += cost;
    return limit - bucket.used;
  }
}

/** Read-only console with bounded requests and TTL caching. @example await new ConsoleService().handle({action: "tools"}, "cli") */
export class ConsoleService {
  private readonly budget = new Budget();
  private readonly globalBudget = new Budget();
  private readonly cache = new Map<string, { payload: Payload; until: number }>();
  private catalog: Catalog | undefined;
  private catalogUntil = 0;
  private busy = false;
  constructor(
    private readonly transport: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async handle(input: unknown, visitor: string): Promise<ConsoleResponse> {
    const request = parseRequest(input);
    const budgetRemaining = this.budget.take(visitor, request.action === "estimate" ? 5 : 1, this.now());
    this.globalBudget.take("all", 1, this.now(), POLICY.globalBudget);
    const key = JSON.stringify(request);
    const saved = this.cache.get(key);
    if (saved && saved.until > this.now())
      return {
        payload: saved.payload,
        cached: true,
        servedAt: new Date(this.now()).toISOString(),
        requests: 0,
        budgetRemaining,
      };
    if (this.busy) throw new ConsoleError("Console is serving another request. Retry shortly.", 429);
    this.busy = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POLICY.timeoutMs);
    let requests = 0;
    const counted: typeof fetch = (url, init) => {
      requests++;
      return this.transport(url, init);
    };
    const transport = boundedFetch(counted, controller.signal);
    const client = new McpClient({
      fetch: transport,
      timeoutMs: 8000,
      retries: 1,
      minIntervalMs: 300,
      baseDelayMs: 400,
      sleep: async (ms) => {
        controller.signal.throwIfAborted();
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timeout);
            reject(new Error("Console deadline exceeded"));
          };
          const timeout = setTimeout(
            () => {
              controller.signal.removeEventListener("abort", abort);
              resolve();
            },
            Math.min(ms, POLICY.timeoutMs),
          );
          controller.signal.addEventListener("abort", abort, { once: true });
        });
      },
    });
    try {
      if (!this.catalog || this.catalogUntil <= this.now()) {
        const result = await client.listTools();
        this.catalog = { tools: parseTools(result.value), measuredAt: result.measuredAt, source: DEFAULT_URL };
        this.catalogUntil = this.now() + POLICY.catalogMs;
      }
      const call = async (name: string, args: Record<string, unknown>) => {
        controller.signal.throwIfAborted();
        const tool = this.catalog?.tools.find((tool) => tool.name === name);
        if (!tool) throw new ConsoleError("Tool is absent from discovery");
        validateInput(tool, args);
        return observation(tool, args, await client.callTool(name, args));
      };
      let payload: Payload;
      if (request.action === "tools") payload = { kind: "tools", catalog: this.catalog };
      else if (request.action === "call")
        payload = { kind: "call", observation: await call(request.tool, request.args) };
      else if (request.action === "introspect") {
        const result = await call("flop_indexer_query", { query: INTROSPECTION_QUERY });
        payload = { kind: "introspect", observation: result, fields: completions(result.value) };
      } else {
        const estimate: Estimate = {
          input: request.input,
          observations: [],
          errors: [],
          gateway: null,
          gatewayError: null,
        };
        for (const { tool, args } of estimateCalls(request.input)) {
          try {
            estimate.observations.push(await call(tool, args));
          } catch (error) {
            estimate.errors.push({ tool, message: String(error) });
          }
        }
        try {
          const response = await transport(GATEWAY_URL, { headers: { "User-Agent": "flop-lab-console/0.1" } });
          if (!response.ok) throw new Error(`Gateway HTTP ${response.status}`);
          estimate.gateway = gatewayPrice(
            await response.json(),
            request.input.model,
            new Date(this.now()).toISOString(),
          );
          if (!estimate.gateway) estimate.gatewayError = "No gateway entry for this model";
        } catch (error) {
          estimate.gatewayError = String(error);
        }
        payload = { kind: "estimate", estimate };
      }
      // Small insertion-ordered cache. Expired entries never serve as live data.
      for (const [key, entry] of this.cache) if (entry.until <= this.now()) this.cache.delete(key);
      if (this.cache.size >= 50) this.cache.delete(this.cache.keys().next().value ?? "");
      this.cache.set(key, {
        payload,
        until: this.now() + (request.action === "tools" ? POLICY.catalogMs : POLICY.cacheMs),
      });
      return { payload, cached: false, servedAt: new Date(this.now()).toISOString(), requests, budgetRemaining };
    } finally {
      clearTimeout(timer);
      this.busy = false;
    }
  }
}
