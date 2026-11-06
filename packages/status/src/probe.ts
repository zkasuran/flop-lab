// SPDX-License-Identifier: Apache-2.0
import { McpClient, pickResponse } from "@flop-lab/mcp";
import { SERVICES, checkContent, validInitialize, type ServiceId } from "./services";
import { parseRun, type Probe, type Run } from "./schema";
export const BODY_LIMIT = 196_608;
export const CACHE_TTL_MS = 300_000;
export type RawResponse = {
  service: ServiceId;
  source: string;
  measuredAt: string;
  httpStatus: number;
  contentType: string;
  body: string;
};
export type ProbeOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  observer?: string;
  onResponse?: (response: RawResponse) => void;
};
class BodyTooLarge extends Error {}

/** Read a bounded response, keeping the supplied fetch signal alive through the body. @example await readBody(response) */
export async function readBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > BODY_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new BodyTooLarge("Response exceeds body limit");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}

async function probe(service: (typeof SERVICES)[number], options: ProbeOptions, timeoutMs: number): Promise<Probe> {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const controller = new AbortController();
  let timedOut = false;
  let status: number | null = null;
  let body = "";
  let type = "";
  let retryAfterMs = 0;
  let outcome: Probe["outcome"] = "content-error";
  let detail = "Response did not match the content check";
  const deadline = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("deadline")), { once: true });
  });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const doFetch: typeof fetch = async (url, init) => {
    const response = await (options.fetch ?? fetch)(url, {
      ...init,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    status = response.status;
    type = response.headers.get("content-type") ?? "";
    const retry = response.headers.get("retry-after");
    const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 0;
    retryAfterMs = Number.isFinite(delay) ? Math.max(0, Math.min(86_400_000, delay)) : 0;
    body = await readBody(response);
    options.onResponse?.({
      service: service.id,
      source: service.url,
      measuredAt: new Date().toISOString(),
      httpStatus: response.status,
      contentType: type,
      body,
    });
    return new Response(body, { status: response.status, headers: response.headers });
  };
  try {
    const operation = async () => {
      if (service.method === "initialize") {
        const client = new McpClient({
          url: service.url,
          fetch: doFetch,
          retries: 0,
          timeoutMs,
          minIntervalMs: 0,
          userAgent: "flop-lab-status/0.1 (+https://github.com/zkasuran/flop-lab)",
        });
        const result = await client.initialize();
        const envelope = pickResponse(body, 1);
        return (
          envelope.jsonrpc === "2.0" &&
          envelope.id === 1 &&
          (type.includes("json") || type.includes("text/event-stream")) &&
          validInitialize(result.value)
        );
      }
      await doFetch(service.url, {
        headers: {
          "User-Agent": "flop-lab-status/0.1 (+https://github.com/zkasuran/flop-lab)",
          Accept: "application/json, text/plain, text/html",
        },
      });
      return checkContent(service.id, body, type);
    };
    const valid = await Promise.race([operation(), deadline]);
    if (valid && status === 200) {
      outcome = "pass";
      detail = service.check;
    }
  } catch (error) {
    if (timedOut) {
      outcome = "timeout";
      detail = "Probe exceeded its total request and body deadline";
    } else if (
      error instanceof BodyTooLarge ||
      (error instanceof Error && error.message.includes("Response exceeds body limit"))
    ) {
      outcome = "body-too-large";
      detail = "Response exceeds the body limit";
    } else if (status === null) {
      outcome = "network-error";
      detail = "No HTTP response received";
    }
  } finally {
    clearTimeout(timer);
  }
  if (status !== null && status !== 200) {
    outcome = "http-error";
    detail = `HTTP ${status}; redirects are not followed`;
  }
  return {
    service: service.id,
    source: service.url,
    method: service.method,
    startedAt,
    measuredAt: new Date().toISOString(),
    latencyMs: Math.round(performance.now() - started),
    httpStatus: status,
    outcome,
    detail,
    bytes: new TextEncoder().encode(body).byteLength,
    retryAfterMs,
  };
}

/** One request per fixed service, with bounded bodies and deadlines. @example const run = await probeServices({ observer: "local" }); */
export async function probeServices(options: ProbeOptions = {}): Promise<Run> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const observer = options.observer ?? "local";
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30_000 ||
    !/^[a-zA-Z0-9:/._-]{1,200}$/.test(observer)
  )
    throw new Error("Invalid probe options");
  const startedAt = new Date().toISOString();
  // Distinct hosts can run concurrently. Each receives exactly one application request.
  const probes = await Promise.all(SERVICES.map((service) => probe(service, options, timeoutMs)));
  return parseRun({
    version: 1,
    observer,
    startedAt,
    finishedAt: new Date().toISOString(),
    timeoutMs,
    requests: probes.length,
    probes,
  });
}

/** Coalesce callers and cache observations. Failures double cooldown up to one hour; Retry-After can extend it to one day. @example const read = createMonitor(); await read(); */
export function createMonitor(options: ProbeOptions & { now?: () => number } = {}) {
  let cached: Run | undefined;
  let inFlight: Promise<Run> | undefined;
  let until = 0;
  let failures = 0;
  const now = options.now ?? Date.now;
  return async (): Promise<Run> => {
    if (cached && now() < until) return structuredClone(cached);
    inFlight ??= probeServices(options)
      .then((run) => {
        const failed = run.probes.some((p) => p.outcome !== "pass");
        failures = failed ? failures + 1 : 0;
        const cooldown = Math.max(
          Math.min(3_600_000, CACHE_TTL_MS * 2 ** Math.min(failures, 4)),
          ...run.probes.map((p) => p.retryAfterMs),
        );
        cached = run;
        until = now() + cooldown;
        return run;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return structuredClone(await inFlight);
  };
}
