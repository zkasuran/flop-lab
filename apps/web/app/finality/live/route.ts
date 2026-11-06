// SPDX-License-Identifier: Apache-2.0
import { readLive } from "../data";

export const dynamic = "force-dynamic";
/** One cached public observation per server instance. @example GET /finality/live */
export async function GET() {
  try {
    return Response.json(await readLive(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Public observation unavailable. Last-known data is retained." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
