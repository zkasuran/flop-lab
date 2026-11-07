// SPDX-License-Identifier: Apache-2.0
import { isIP } from "node:net";
import { openapiDocument } from "./document";
import { readResult } from "./recorded";
import { endpoints, parseResult, revalidateSeconds, schemaVersion, type Endpoint } from "./schema";

/** Trust only Vercel's overwritten client address. Other deployments share a fallback bucket unless an adapter supplies an IP. @example clientAddress(request) */
export function clientAddress(request: Request): string {
  return process.env.VERCEL === "1" ? (request.headers.get("x-vercel-forwarded-for") ?? "unknown") : "unknown";
}
function normalizeIP(value: string) {
  if (isIP(value) === 4) return value;
  if (isIP(value) === 6) return new URL(`http://[${value}]/`).hostname;
  return "unknown";
}

/** Create a bounded per-instance read service. The IP callback must use a trusted proxy or socket address. @example const serve = createApi(); await serve(new Request("http://localhost/api/v1/models")) */
export function createApi(
  options: { now?: () => number; address?: (request: Request) => string; load?: (tool: Endpoint) => unknown } = {},
) {
  const now = options.now ?? Date.now;
  const address = options.address ?? clientAddress;
  const load = options.load ?? readResult;
  const buckets = new Map<string, { start: number; count: number }>();
  const cache = new Map<string, { at: number; body: string }>();
  return (request: Request): Response => {
    const at = now();
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Schema-Version": schemaVersion,
    });
    const send = (body: string, status: number) =>
      new Response(request.method === "HEAD" ? null : body, { status, headers });
    const error = (status: number, code: string, message: string) =>
      send(JSON.stringify({ schemaVersion, error: code, message }), status);
    for (const [key, bucket] of buckets) if (at - bucket.start >= 60_000) buckets.delete(key);
    const ip = normalizeIP(address(request));
    let bucket = buckets.get(ip);
    if (!bucket) {
      if (buckets.size >= 4096) {
        headers.set("Retry-After", "60");
        return error(429, "rate_limited", "IP quota storage is full. Retry later.");
      }
      bucket = { start: at, count: 0 };
      buckets.set(ip, bucket);
    }
    headers.set("X-RateLimit-Limit", "60");
    headers.set("X-RateLimit-Remaining", String(Math.max(0, 60 - bucket.count - 1)));
    if (bucket.count >= 60) {
      headers.set("Retry-After", String(Math.max(1, Math.ceil((bucket.start + 60_000 - at) / 1000))));
      return error(429, "rate_limited", "Read quota reached. Respect Retry-After.");
    }
    bucket.count++;
    if (!["GET", "HEAD"].includes(request.method)) {
      headers.set("Allow", "GET, HEAD");
      return error(405, "method_not_allowed", "Use GET or HEAD.");
    }
    const url = new URL(request.url);
    if (url.search) return error(400, "bad_request", "This API does not accept query parameters.");
    const key = url.pathname.replace(/^\/api\/v1\//, "");
    if (url.pathname !== `/api/v1/${key}` || (key !== "openapi.json" && !endpoints.includes(key as Endpoint)))
      return error(404, "not_found", "Unknown result endpoint.");
    headers.set("X-Data-Revalidate", String(revalidateSeconds));
    let hit = cache.get(key);
    if (!hit || at - hit.at >= revalidateSeconds * 1000) {
      try {
        const value = key === "openapi.json" ? openapiDocument() : parseResult(key as Endpoint, load(key as Endpoint));
        hit = { at, body: JSON.stringify(value) };
        cache.set(key, hit);
      } catch {
        return error(503, "unavailable", "Bundled evidence failed validation. No result is reported.");
      }
    }
    headers.set("X-Data-Cache-Age", String(Math.floor((at - hit.at) / 1000)));
    return send(hit.body, 200);
  };
}
