// SPDX-License-Identifier: Apache-2.0
import { parseSse } from "./sse";

export const DEFAULT_URL = "https://mcp.flop.network/mcp";
export const DEFAULT_USER_AGENT = "flop-lab/0.1 (+https://github.com/zkasuran/flop-lab)";

export type McpErrorKind = "rpc" | "tool" | "http" | "network" | "timeout" | "protocol";

/** Every failure of the client. `kind` tells a caller whether retrying can help. */
export class McpError extends Error {
  constructor(
    message: string,
    readonly kind: McpErrorKind,
    readonly details: { status?: number; code?: number; tool?: string; attempts?: number } = {},
  ) {
    super(message);
    this.name = "McpError";
  }
  /** True when the same request may succeed later (network, timeout, 429, 5xx). */
  get retryable(): boolean {
    if (this.kind === "network" || this.kind === "timeout") return true;
    if (this.kind === "http") return this.details.status === 429 || (this.details.status ?? 0) >= 500;
    return false;
  }
}

export interface McpClientOptions {
  url?: string;
  /** Injected for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  userAgent?: string;
  /** Per attempt. Default 20000. */
  timeoutMs?: number;
  /** Extra attempts after the first for retryable failures. Default 3. */
  retries?: number;
  /** First backoff step. Doubles each attempt, with jitter. Default 400. */
  baseDelayMs?: number;
  /** Smallest gap between two requests from this client. Default 250. */
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export interface CallResult<T> {
  value: T;
  /** The tool's text content exactly as received. */
  raw: string;
  /** ISO time the answer was received. */
  measuredAt: string;
  durationMs: number;
  attempts: number;
}

export interface ClientStats {
  requests: number;
  retries: number;
  failures: number;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

/**
 * Client for the hosted FLOP MCP server (JSON-RPC 2.0 over POST, answered as server-sent events).
 * Session-less: the hosted server answers `tools/list` and `tools/call` without `initialize`.
 * Calls are spaced by `minIntervalMs` and retried with exponential backoff on network errors, timeouts, 429 and 5xx.
 */
export class McpClient {
  readonly stats: ClientStats = { requests: 0, retries: 0, failures: 0 };
  private readonly url: string;
  private readonly doFetch: typeof fetch;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly baseDelayMs: number;
  private readonly minIntervalMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private nextId = 1;
  private lastStart = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: McpClientOptions = {}) {
    this.url = options.url ?? DEFAULT_URL;
    this.doFetch = options.fetch ?? ((...a) => fetch(...a));
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.retries = options.retries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 400;
    this.minIntervalMs = options.minIntervalMs ?? 250;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  /** Lists the server's tools with their JSON Schemas. */
  async listTools(): Promise<CallResult<McpToolInfo[]>> {
    const r = await this.rpc("tools/list", undefined);
    const tools = (r.result as { tools?: McpToolInfo[] } | undefined)?.tools;
    if (!Array.isArray(tools)) throw new McpError("tools/list answered without a tools array", "protocol");
    return {
      value: tools,
      raw: JSON.stringify(r.result),
      measuredAt: r.measuredAt,
      durationMs: r.durationMs,
      attempts: r.attempts,
    };
  }

  /**
   * Calls one tool. The tool's first text content is parsed as JSON when it is JSON, otherwise returned as a string.
   * A tool-level failure (`isError`) and an unknown tool both throw `McpError`.
   */
  async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<CallResult<T>> {
    const r = await this.rpc("tools/call", { name, arguments: args });
    const result = r.result as { content?: { type?: string; text?: string }[]; isError?: boolean } | undefined;
    const text = result?.content?.find((c) => c.type === "text")?.text;
    if (typeof text !== "string")
      throw new McpError(`tool ${name} answered without text content`, "protocol", { tool: name });
    if (result?.isError) throw new McpError(text, "tool", { tool: name, attempts: r.attempts });
    let value: unknown = text;
    try {
      value = JSON.parse(text);
    } catch {
      // plain text answer
    }
    return { value: value as T, raw: text, measuredAt: r.measuredAt, durationMs: r.durationMs, attempts: r.attempts };
  }

  private async rpc(
    method: string,
    params: unknown,
  ): Promise<{ result: unknown; measuredAt: string; durationMs: number; attempts: number }> {
    // one request at a time per client, spaced by minIntervalMs
    const run = this.queue.then(() => this.rpcLocked(method, params));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async rpcLocked(method: string, params: unknown) {
    const id = this.nextId++;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
    let lastError: McpError | undefined;
    for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
      const wait = this.lastStart + this.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastStart = this.now();
      this.stats.requests++;
      const started = this.now();
      try {
        const result = await this.once(body, id);
        return {
          result,
          measuredAt: new Date(this.now()).toISOString(),
          durationMs: this.now() - started,
          attempts: attempt,
        };
      } catch (e) {
        const err = e instanceof McpError ? e : new McpError(String(e), "network");
        lastError = new McpError(err.message, err.kind, { ...err.details, attempts: attempt });
        if (!err.retryable || attempt > this.retries) break;
        this.stats.retries++;
        const retryAfter = err.details.status === 429 ? this.retryAfterMs : 0;
        const backoff = this.baseDelayMs * 2 ** (attempt - 1) * (0.75 + this.random() * 0.5);
        await this.sleep(Math.max(backoff, retryAfter));
      }
    }
    this.stats.failures++;
    throw lastError ?? new McpError("request failed", "network");
  }

  private retryAfterMs = 0;

  private async once(body: string, id: number): Promise<unknown> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.doFetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "User-Agent": this.userAgent,
        },
        body,
        signal: ctl.signal,
      });
    } catch (e) {
      if (ctl.signal.aborted) throw new McpError(`no answer within ${this.timeoutMs} ms`, "timeout");
      throw new McpError(`request failed: ${e instanceof Error ? e.message : String(e)}`, "network");
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    this.retryAfterMs = 0;
    if (!res.ok) {
      const ra = Number(res.headers.get("retry-after"));
      if (Number.isFinite(ra) && ra > 0) this.retryAfterMs = Math.min(ra * 1000, 30_000);
      throw new McpError(`HTTP ${res.status}: ${text.slice(0, 200)}`, "http", { status: res.status });
    }
    const message = pickResponse(text, id);
    if (message.error) {
      throw new McpError(message.error.message ?? "JSON-RPC error", "rpc", { code: message.error.code });
    }
    if (message.result === undefined) throw new McpError("answer has neither result nor error", "protocol");
    return message.result;
  }
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: { readOnlyHint?: boolean };
}

/** Finds the JSON-RPC answer for `id` in an SSE body, or in a plain JSON body. */
export function pickResponse(body: string, id: number): JsonRpcResponse {
  const candidates: string[] = [];
  const events = parseSse(body);
  if (events.length > 0) candidates.push(...events.map((e) => e.data));
  else candidates.push(body);
  for (const c of candidates) {
    try {
      const j = JSON.parse(c) as JsonRpcResponse;
      if (j && typeof j === "object" && (j.id === id || j.id === undefined || j.id === null)) return j;
    } catch {
      // keep looking
    }
  }
  throw new McpError(`no JSON-RPC answer for request ${id} in a ${body.length} byte body`, "protocol");
}
