// SPDX-License-Identifier: Apache-2.0
import { createEvidenceService } from "../service";

export const runtime = "nodejs";
export const maxDuration = 120;
const collect = createEvidenceService();

/** Read a bounded collection on demand. Example: GET /verify/data?channel=0x... */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const reply = await collect(url.searchParams.get("channel") ?? "recent");
  return Response.json(reply.body, {
    status: reply.status,
    headers: {
      "Cache-Control": "no-store",
      ...(reply.status === 429 ? { "Retry-After": "30" } : {}),
    },
  });
}
