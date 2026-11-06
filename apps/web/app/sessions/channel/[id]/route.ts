// SPDX-License-Identifier: Apache-2.0
import { report } from "../../data";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^0x[0-9a-f]{64}$/i.test(id)) return Response.json({ error: "Invalid channel ID" }, { status: 400 });
  const session = report.sessions.find((s) => s.channelId === id.toLowerCase());
  return session
    ? Response.json(session, { headers: { "Cache-Control": "public, max-age=300" } })
    : Response.json({ error: "Channel not found in this recording" }, { status: 404 });
}
