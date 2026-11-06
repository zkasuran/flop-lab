// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { LIMITS, failure, routePolicy, sameOrigin } from "./policy";

/** Trust only Vercel's overwritten client header. Other hosts share one bucket. @example visitorKey(request) */
export function visitorKey(request: Request): string {
  const value = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  const address =
    value && !value.includes("%") && isIP(value)
      ? new URL(`http://${value.includes(":") ? `[${value}]` : value}`).hostname
      : "shared";
  return createHash("sha256").update(address).digest("hex");
}

/** Bounded process-local fixed windows. Full stores fail closed. @example new RequestBudget().take('ip', 30) */
export class RequestBudget {
  private buckets = new Map<string, { used: number; until: number }>();
  constructor(private readonly now = Date.now) {}
  take(key: string, limit: number): boolean {
    const now = this.now();
    for (const [key, value] of this.buckets) if (value.until <= now) this.buckets.delete(key);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= LIMITS.buckets) return false;
      bucket = { used: 0, until: now + LIMITS.windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.used >= limit) return false;
    bucket.used++;
    return true;
  }
}

/** Validate before route work or body parsing, including malformed requests in budgets. @example createAdmission()(request) */
export function createAdmission(budget = new RequestBudget()) {
  return (request: Request): Response | null => {
    const url = new URL(request.url);
    let path: string;
    try {
      path = decodeURIComponent(url.pathname).replace(/\/$/, "") || "/";
    } catch {
      return failure(400);
    }
    const policy = routePolicy(path);
    const visitor = visitorKey(request);
    if (!budget.take(`${policy ? "api" : "page"}:${visitor}`, policy ? LIMITS.apiPerVisitor : LIMITS.pagePerVisitor))
      return failure(429);
    if (policy && !budget.take("all-api", LIMITS.apiGlobal)) return failure(429);
    if (new TextEncoder().encode(request.url).length > LIMITS.urlBytes) return failure(414);
    if (request.headers.has("x-middleware-subrequest")) return failure(400);
    if (!policy) return ["GET", "HEAD"].includes(request.method) ? null : failure(405);
    if (!policy.methods.includes(request.method)) {
      const reply = failure(405);
      reply.headers.set("Allow", policy.methods.join(", "));
      return reply;
    }
    if (!sameOrigin(request)) return failure(403);
    for (const key of url.searchParams.keys()) {
      if (
        !policy.query.includes(key) ||
        url.searchParams.getAll(key).length !== 1 ||
        (url.searchParams.get(key)?.length ?? 0) > 256
      )
        return failure(400);
    }
    if (path === "/explorer/query" && url.searchParams.has("q") && url.searchParams.has("recorded"))
      return failure(400);
    const length = request.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > LIMITS.requestBytes)) return failure(413);
    if (request.method === "POST") {
      if (
        path === "/console/api" &&
        request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
      )
        return failure(415);
      if (
        path === "/invariants/replay" &&
        ((length !== null && length !== "0") || request.headers.has("transfer-encoding"))
      )
        return failure(413);
    }
    return null;
  };
}
