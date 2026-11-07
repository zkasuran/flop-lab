// SPDX-License-Identifier: Apache-2.0
import { LIMITS, failure } from "./policy";
import { AsyncLocalStorage } from "node:async_hooks";

const operation = new AsyncLocalStorage<AbortSignal>();
let operations = 0;

/** Bound a live route's wall time and downstream work, with no waiting queue. @example withPublicOperation(load, 20_000) */
export async function withPublicOperation(load: () => Promise<Response>, timeoutMs = 60_000): Promise<Response> {
  if (operations >= 4) return failure(429);
  operations++;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Response>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(failure(503));
    }, timeoutMs);
  });
  const work = operation
    .run(controller.signal, async () => load())
    .catch(() => failure(502))
    .finally(() => {
      operations--;
      clearTimeout(timer);
    });
  return Promise.race([work, deadline]);
}

/** Read a stream under a byte cap and deadline, cancelling stalled bodies. @example readBytes(response.body, 200_000, signal) */
export async function readBytes(
  stream: ReadableStream<Uint8Array> | null,
  max: number,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) throw new RangeError("Body exceeds byte limit");
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

/** Only fixed public endpoints and validated recorder paths may leave the web server. @example allowedSource(url) */
export function allowedSource(input: string | URL | Request): URL {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash)
    throw new Error("Source denied");
  const fixed = [
    "https://mcp.flop.network/mcp",
    "https://api.flop.network/v1/models",
    "https://raw.githubusercontent.com/zkasuran/flop-lab/main/SIGNATURE.json",
    "https://raw.githubusercontent.com/zkasuran/flop-lab/data/status/recent.jsonl",
  ];
  const data =
    url.origin === "https://raw.githubusercontent.com" &&
    !url.search &&
    /^\/zkasuran\/flop-lab\/data\/(?:index\.json|snapshots\/\d{4}\/\d{2}\/\d{2}\/[\dTZ.-]+-[a-f0-9]{64}\.json)$/.test(
      url.pathname,
    );
  const github = url.origin === "https://api.github.com" && url.pathname === "/search/issues";
  const chat =
    url.origin === "https://technocore.chat" &&
    ((/^\/kv\/[a-z0-9_-]{1,48}\/[a-z0-9_-]{1,48}$/.test(url.pathname) && !url.search) ||
      (/^\/r\/[a-z0-9_-]{1,48}$/.test(url.pathname) &&
        /^\?format=json&limit=100(?:&since=\d{1,16})?$/.test(url.search)));
  if (!fixed.includes(url.href) && !data && !github && !chat) throw new Error("Source denied");
  return url;
}

/** Shared egress caps include body time, redirects, concurrency and origin backoff. @example createPublicFetch()(url) */
export function createPublicFetch(transport: typeof fetch = fetch, now = Date.now): typeof fetch {
  let active = 0;
  const origins = new Map<string, { until: number; used: number; reset: number }>();
  return async (input, init) => {
    const url = allowedSource(input);
    const state = origins.get(url.origin) ?? { until: 0, used: 0, reset: now() + 60_000 };
    if (now() >= state.reset) {
      state.used = 0;
      state.reset = now() + 60_000;
    }
    if (active >= 4 || now() < state.until || state.used >= 120) throw new Error("Public source budget reached");
    origins.set(url.origin, state);
    state.used++;
    active++;
    const parent = operation.getStore();
    const signal = AbortSignal.any([
      AbortSignal.timeout(8000),
      ...(init?.signal ? [init.signal] : []),
      ...(parent ? [parent] : []),
    ]);
    try {
      signal.throwIfAborted();
      const response = await transport(url, { ...init, redirect: "error", credentials: "omit", signal });
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        if (response.status === 429 || response.status === 403 || response.status >= 500) {
          const retry = response.headers.get("retry-after");
          const wait = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry ?? "") - now();
          state.until = now() + Math.min(3_600_000, Math.max(60_000, Number.isFinite(wait) ? wait : 0));
        }
        // Do not propagate upstream error pages, cookies or implementation details.
        return new Response(null, { status: response.status, headers: { "Retry-After": "60" } });
      }
      const max =
        url.href === "https://raw.githubusercontent.com/zkasuran/flop-lab/data/index.json" ? 4_000_000 : 200_000;
      const bytes = await readBytes(response.body, max, signal);
      return new Response(bytes, {
        status: response.status,
        headers: { "Content-Type": response.headers.get("content-type") ?? "application/octet-stream" },
      });
    } catch {
      state.until = Math.max(state.until, now() + 60_000);
      throw new Error("Public source unavailable");
    } finally {
      active--;
    }
  };
}

export const publicFetch = createPublicFetch();

/** Buffer a bounded JSON reply without reflecting internal exception messages. @example safeJson({ok:true}) */
export function safeJson(value: unknown, init?: ResponseInit): Response {
  const raw = JSON.stringify(value);
  if (new TextEncoder().encode(raw).length > LIMITS.responseBytes) return failure(502);
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store");
  return new Response(raw, { ...init, headers });
}

/** Parse exact JSON media type with byte and slow-body limits. @example readRequestJson(request) */
export async function readRequestJson(request: Request): Promise<unknown> {
  const bytes = await readBytes(request.body, LIMITS.requestBytes, AbortSignal.timeout(LIMITS.bodyMs));
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}
