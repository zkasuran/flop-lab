// SPDX-License-Identifier: Apache-2.0
import type { Trace } from "./model.ts";

export interface Step {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  fault?: "disconnect" | "timeout";
  bodyDelayMs?: number;
}
export const endpoints = {
  gateway: "https://gateway.sdkconf.invalid/v1",
  faucet: "https://faucet.sdkconf.invalid",
  mcp: "https://mcp.sdkconf.invalid/mcp",
};

/** In-process Fetch transport. Never delegates to real networking. @example new ScriptedService([{status: 429}]) */
export class ScriptedService {
  readonly trace: Trace[] = [];
  private readonly started = performance.now();
  private readonly steps: readonly Step[];
  private readonly repeatLast: boolean;
  constructor(steps: readonly Step[], repeatLast = false) {
    if (!steps.length) throw new Error("A mock scenario needs at least one step");
    this.steps = steps;
    this.repeatLast = repeatLast;
  }
  readonly fetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const entry: Trace = {
      sequence: this.trace.length + 1,
      atMs: Math.round((performance.now() - this.started) * 100) / 100,
      method: request.method,
      url: request.url,
      body: request.body ? await request.text() : null,
      headers: Object.fromEntries(request.headers),
      status: null,
      responseHeaders: {},
      outcome: "pending",
    };
    this.trace.push(entry);
    if (!Object.values(endpoints).some((endpoint) => new URL(endpoint).origin === new URL(request.url).origin)) {
      entry.outcome = "blocked unexpected origin";
      throw new Error(entry.outcome);
    }
    const step =
      this.steps[this.repeatLast ? Math.min(this.trace.length - 1, this.steps.length - 1) : this.trace.length - 1];
    if (!step || this.trace.length > 100) {
      entry.outcome = "script exhausted";
      throw new Error(entry.outcome);
    }
    request.signal.throwIfAborted();
    if (step.fault === "disconnect") {
      entry.outcome = "synthetic transport disconnect";
      throw new TypeError(entry.outcome);
    }
    if (step.fault === "timeout") {
      entry.outcome = "waiting for caller abort";
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => {
          entry.outcome = "caller aborted";
          reject(request.signal.reason);
        };
        if (request.signal.aborted) abort();
        else request.signal.addEventListener("abort", abort, { once: true });
      });
    }
    const headers = { "content-type": "application/json", ...step.headers };
    entry.status = step.status ?? 200;
    entry.responseHeaders = headers;
    entry.outcome = "response";
    let body: BodyInit = step.body ?? "{}";
    if (step.bodyDelayMs) {
      body = new ReadableStream<Uint8Array>({
        start(controller) {
          const cleanup = () => {
            clearTimeout(timer);
            request.signal.removeEventListener("abort", abort);
          };
          const abort = () => {
            cleanup();
            entry.outcome = "body aborted";
            controller.error(request.signal.reason);
          };
          const timer = setTimeout(() => {
            cleanup();
            controller.enqueue(new TextEncoder().encode(step.body ?? "{}"));
            controller.close();
          }, step.bodyDelayMs);
          request.signal.addEventListener("abort", abort, { once: true });
          if (request.signal.aborted) abort();
        },
      });
    }
    return new Response(body, { status: entry.status, headers });
  };
}
