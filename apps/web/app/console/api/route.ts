// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { ConsoleError, ConsoleService } from "../../../../../packages/console/src/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const service = new ConsoleService();

/** Same-origin read-only proxy. @example POST /console/api {"action":"tools"} */
export async function POST(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
  const origin = request.headers.get("origin");
  if (origin) {
    // Next can rewrite request.url to an internal hostname. Host retains the browser-facing authority.
    let sameOrigin = false;
    try {
      const parsed = new URL(origin);
      sameOrigin =
        ["http:", "https:"].includes(parsed.protocol) &&
        parsed.host === (request.headers.get("host") ?? new URL(request.url).host);
    } catch {
      /* Opaque and malformed origins are denied. */
    }
    if (!sameOrigin) return Response.json({ error: "Cross-origin request denied" }, { status: 403, headers });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "Use application/json" }, { status: 415, headers });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Request body required" }, { status: 400, headers });
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => undefined);
  }, 5000);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (expired) throw new ConsoleError("Request body timed out", 408);
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 32_768) {
        await reader.cancel();
        throw new ConsoleError("Request exceeds 32768 bytes", 413);
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    // Only trust the platform-owned header on Vercel. Other hosts share one conservative bucket.
    const address =
      process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : undefined;
    const visitor = createHash("sha256")
      .update(address || "shared-local")
      .digest("hex");
    return Response.json(await service.handle(body, visitor), { headers });
  } catch (error) {
    const status = error instanceof ConsoleError ? error.status : 400;
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "60" } : {}) } },
    );
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
