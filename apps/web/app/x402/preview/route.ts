// SPDX-License-Identifier: Apache-2.0
import { McpClient, listSettlements, escrowConserved } from "@flop-lab/mcp";
import { parsePreview } from "../data";

const client = new McpClient({ timeoutMs: 4000, retries: 1, minIntervalMs: 500 });
let cached: { expires: number; body: unknown; status: number } | undefined;
let pending: Promise<Response> | undefined;

/** Cached read-only observation. @example GET /x402/preview */
export async function GET(): Promise<Response> {
  if (cached && Date.now() < cached.expires)
    return Response.json(cached.body, { status: cached.status, headers: { "Cache-Control": "no-store" } });
  if (pending) return (await pending).clone();
  pending = (async () => {
    let body: unknown,
      status = 200;
    try {
      const observation = await listSettlements(client, { limit: 5 });
      body = parsePreview({
        source: "https://mcp.flop.network/mcp",
        measuredAt: observation.measuredAt,
        mode: "live",
        rows: observation.value.data.map((s) => ({
          channelId: s.channelId,
          settledBlock: s.settledBlock,
          minerPaid: s.minerPaid,
          escrowConserved: escrowConserved(s),
        })),
      });
    } catch {
      body = { error: "Observation unavailable. Keep the dated recording." };
      status = 503;
    }
    cached = { expires: Date.now() + 60000, body, status };
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  })();
  try {
    return (await pending).clone();
  } finally {
    pending = undefined;
  }
}
