// SPDX-License-Identifier: Apache-2.0
import { McpClient, DEFAULT_URL, DEFAULT_USER_AGENT } from "@flop-lab/mcp";
import type { Evidence } from "./types";

export const GATEWAY = "https://api.flop.network/v1/models";
export const MAX_BODY_BYTES = 196_608;

export class BoundaryError extends Error {}

/** A transport budget counts physical attempts, including retries. @example new Transport({ maxRequests: 20 }) */
export class Transport {
  readonly evidence: Evidence[] = [];
  readonly client: McpClient;
  readonly maxRequests: number;
  private count = 0;
  private readonly starts = new Map<string, number>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly baseFetch: typeof fetch;
  private readonly interval: number;
  private readonly timeout: number;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(
    options: {
      maxRequests?: number;
      fetch?: typeof fetch;
      intervalMs?: number;
      timeoutMs?: number;
      sleep?: (ms: number) => Promise<void>;
    } = {},
  ) {
    this.maxRequests = options.maxRequests ?? 80;
    if (!Number.isSafeInteger(this.maxRequests) || this.maxRequests < 0)
      throw new Error("max-requests must be a nonnegative safe integer");
    this.baseFetch = options.fetch ?? fetch;
    this.interval = options.intervalMs ?? 500;
    this.timeout = options.timeoutMs ?? 20_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.client = new McpClient({
      fetch: this.fetch,
      retries: 1,
      minIntervalMs: 0,
      sleep: this.sleep,
      timeoutMs: this.timeout,
    });
  }
  get requests(): number {
    return this.count;
  }
  get exhausted(): boolean {
    return this.count >= this.maxRequests;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const host = new URL(String(input)).host;
    const pending = (this.queues.get(host) ?? Promise.resolve()).then(() => this.once(input, init));
    this.queues.set(
      host,
      pending.catch(() => undefined),
    );
    return pending;
  };

  private readonly once: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url !== DEFAULT_URL && url !== GATEWAY)
      throw new BoundaryError("Endpoint outside the public read-only allowlist");
    if (this.exhausted) throw new BoundaryError("Global request budget exhausted");
    this.count++;
    const host = new URL(url).host;
    const wait = (this.starts.get(host) ?? 0) + this.interval - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.starts.set(host, Date.now());
    const started = Date.now();
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const item: Evidence = {
      id: this.evidence.length + 1,
      measuredAt: new Date().toISOString(),
      durationMs: 0,
      request: { url, method: init?.method ?? "GET", headers, ...(init?.body ? { body: String(init.body) } : {}) },
      status: null,
      response: "",
    };
    this.evidence.push(item);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.baseFetch(url, {
        ...init,
        redirect: "error",
        signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal,
      });
      item.status = response.status;
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader)
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > MAX_BODY_BYTES) {
            await reader.cancel();
            throw new BoundaryError("Response exceeds recording byte limit");
          }
          chunks.push(next.value);
        }
      item.response = Buffer.concat(chunks).toString("utf8");
      return new Response(item.response, { status: response.status, headers: response.headers });
    } catch (error) {
      item.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      clearTimeout(timer);
      item.durationMs = Date.now() - started;
    }
  };

  async models(): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.fetch(GATEWAY, {
        headers: { "User-Agent": DEFAULT_USER_AGENT, Accept: "application/json" },
      });
      if (response.ok) return response.json();
      if (attempt === 0 && (response.status === 429 || response.status >= 500) && !this.exhausted) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = Number(retryAfter);
        const wait = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter ?? "") - Date.now();
        await this.sleep(Math.min(30_000, Math.max(500, Number.isFinite(wait) ? wait : 500)));
        continue;
      }
      throw new BoundaryError(`Gateway HTTP ${response.status}`);
    }
    throw new BoundaryError("Gateway unavailable");
  }
}
