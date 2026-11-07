// SPDX-License-Identifier: Apache-2.0
import { createEvidenceService } from "../service";
import { safeJson, withPublicOperation } from "../../../lib/security/transport";

export const runtime = "nodejs";
export const maxDuration = 120;
const collect = createEvidenceService();

/** Read a bounded collection on demand. Example: GET /verify/data?channel=0x... */
export async function GET(request: Request) {
  return withPublicOperation(async () => {
    const url = new URL(request.url);
    const reply = await collect(url.searchParams.get("channel") ?? "recent");
    return safeJson(reply.body, {
      status: reply.status,
      headers: {
        "Cache-Control": "no-store",
        ...(reply.status === 429 ? { "Retry-After": "30" } : {}),
      },
    });
  }, 110_000);
}
