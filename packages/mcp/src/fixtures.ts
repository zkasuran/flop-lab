// SPDX-License-Identifier: Apache-2.0
// Node only. Recorded answers of the hosted MCP server (2026-11-05) and a fetch that replays them.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSse } from "./sse";

const dir = fileURLToPath(new URL("../fixtures/", import.meta.url));

/** Raw SSE body of a recorded answer, for example `call-flop_get_stats`. */
export function fixtureSse(name: string): string {
  return readFileSync(`${dir}${name}.sse`, "utf8");
}

/** The tool text of a recorded `tools/call` answer, parsed from JSON. */
export function fixtureTool<T = unknown>(tool: string): T {
  const data = parseSse(fixtureSse(`call-${tool}`))[0]?.data ?? "";
  const msg = JSON.parse(data) as { result: { content: { text: string }[] } };
  return JSON.parse(msg.result.content[0]?.text ?? "null") as T;
}

/**
 * A `fetch` that answers MCP requests from the recorded fixtures: `tools/list` from `tools-list`, and `tools/call` for tool X from `call-X`.
 * The request id is echoed so the client matches the answer. An unknown tool answers like the real server does.
 */
export function replayFetch(overrides: Record<string, string> = {}): typeof fetch {
  return async (_url, init) => {
    const req = JSON.parse(String(init?.body)) as { id: number; method: string; params?: { name?: string } };
    const key = req.method === "tools/list" ? "tools-list" : `call-${req.params?.name ?? ""}`;
    let body: string;
    if (overrides[key] !== undefined) body = overrides[key];
    else {
      try {
        body = fixtureSse(key);
      } catch {
        body = fixtureSse("call-bad-tool");
      }
    }
    return new Response(body.replace(/"id":\s*\d+/, `"id":${req.id}`), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  };
}
