// SPDX-License-Identifier: Apache-2.0
import { parseRules } from "../../../../../packages/watch/src/config";
import { recordedReplay } from "../data";
export async function POST(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing YAML" }, { status: 400 });
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 64_000) return Response.json({ error: "Rule file exceeds limit" }, { status: 413 });
      parts.push(chunk.value);
    }
    const config = parseRules(Buffer.concat(parts).toString("utf8"));
    return Response.json(recordedReplay(config), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid rules" }, { status: 400 });
  } finally {
    await reader.cancel();
  }
}
