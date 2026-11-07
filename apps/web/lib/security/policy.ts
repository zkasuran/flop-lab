// SPDX-License-Identifier: Apache-2.0
export const LIMITS = {
  urlBytes: 2048,
  requestBytes: 32_768,
  responseBytes: 2_000_000,
  bodyMs: 5000,
  windowMs: 60_000,
  apiPerVisitor: 30,
  apiGlobal: 120,
  pagePerVisitor: 240,
  buckets: 2000,
} as const;

/** All data routes reviewed by the threat model. @example routePolicy('/verify/data') */
export function routePolicy(path: string): { methods: string[]; query: string[] } | undefined {
  if (path === "/console/api") return { methods: ["POST"], query: [] };
  if (path === "/watch/replay") return { methods: ["POST"], query: [] };
  if (path === "/invariants/replay") return { methods: ["GET", "HEAD", "POST"], query: [] };
  const queries: Record<string, string[]> = {
    "/explorer/query": ["q", "recorded"],
    "/verify/data": ["channel"],
    "/did/data": ["did"],
    "/knowledge/data": ["concept"],
  };
  if (Object.hasOwn(queries, path)) return { methods: ["GET", "HEAD"], query: queries[path]! };
  if (
    [
      "/api/history.json",
      "/SIGNATURE.json",
      "/history/models.json",
      "/history/feed.xml",
      "/finality/live",
      "/scoreboard/snapshot",
      "/x402/preview",
      "/spec/report",
      "/status/recording",
      "/community/report.json",
      "/upgrades/report.json",
      "/kestra/evidence",
      "/mcp/tool-list",
      ...["indexer", "proofs", "metering", "economics", "models", "sessions", "x402"].map(
        (slug) => `/${slug}/recording`,
      ),
    ].includes(path) ||
    /^\/(?:sessions\/channel|harness\/sources)\/[^/]+$/.test(path) ||
    /^\/docs\/[^/]+\/readme$/.test(path) ||
    /^\/api\/v1\/[^/]+$/.test(path)
  )
    return { methods: ["GET", "HEAD"], query: [] };
  return undefined;
}

/** Fixed, non-reflecting errors are never cacheable. @example failure(413) */
export function failure(status: number): Response {
  const messages: Record<number, string> = {
    400: "Invalid request",
    403: "Cross-origin request denied",
    405: "Method not allowed",
    408: "Request body timed out",
    413: "Request exceeds byte limit",
    414: "Request URL exceeds byte limit",
    415: "Unsupported media type",
    429: "Request budget reached. Retry after one minute.",
    502: "Public observation unavailable",
    503: "Service unavailable",
  };
  return Response.json(
    { error: messages[status] ?? "Request failed" },
    {
      status,
      headers: { "Cache-Control": "private, no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) },
    },
  );
}

/** Match scheme and authority, including a configured public deployment origin. @example sameOrigin(request) */
export function sameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser read-only clients remain supported.
  try {
    const actual = new URL(origin);
    const expected = new URL(process.env.SITE_URL ?? request.url);
    return actual.origin === origin && actual.origin === expected.origin;
  } catch {
    return false;
  }
}

/** Nonce policy permits Motion styles but no inline script or eval in production. @example contentSecurityPolicy(nonce) */
export function contentSecurityPolicy(nonce: string, development = false): string {
  if (!/^[A-Za-z0-9+/=]{24,}$/.test(nonce)) throw new Error("Invalid CSP nonce");
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    `connect-src 'self' https://api.github.com${development ? " ws: wss:" : ""}`,
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    ...(!development ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
