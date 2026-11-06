// SPDX-License-Identifier: Apache-2.0
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createTools, type ToolDefinition } from "./tools";
import { requestCount, withNetworkBudget } from "./network";
export { createTools, type ToolDefinition } from "./tools";

export const CACHE_TTL_MS = 30_000;

/** Generate tools/list from the same schemas used for dispatch. @example listTools().tools[0]?.inputSchema */
export function listTools(definitions: ToolDefinition[] = createTools()) {
  return {
    tools: definitions.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.input, { target: "draft-7", io: "input" }),
      outputSchema: z.toJSONSchema(t.output, { target: "draft-7" }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    })),
  };
}

/** Create an importable dispatcher with schema checks and bounded caching. @example await createSuite().call("lab_verify_tape", {mode:"recorded"}) */
export function createSuite(options: { recorded?: boolean; definitions?: ToolDefinition[]; now?: () => number } = {}) {
  const definitions = options.definitions ?? createTools(options);
  if (new Set(definitions.map((t) => t.name)).size !== definitions.length) throw new Error("Duplicate tool name");
  const now = options.now ?? Date.now;
  const cache = new Map<string, { expires: number; value: Record<string, unknown> }>();
  let queue: Promise<unknown> = Promise.resolve();
  let waiting = 0;
  async function invoke(name: string, raw: unknown) {
    const tool = definitions.find((t) => t.name === name);
    if (!tool) throw new McpError(ErrorCode.InvalidParams, "Unknown suite tool");
    let args = raw;
    const schema = z.toJSONSchema(tool.input, { io: "input" });
    if (
      options.recorded &&
      schema.properties &&
      "mode" in schema.properties &&
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw)
    )
      args = { ...raw, mode: "recorded" };
    const parsed = tool.input.safeParse(args);
    if (!parsed.success) throw new McpError(ErrorCode.InvalidParams, `Invalid tool arguments: ${parsed.error.message}`);
    const key = `${name}:${JSON.stringify(parsed.data)}`;
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return { ...structuredClone(cached.value), cacheHit: true, requests: 0 };
    const { result, requests } = await withNetworkBudget(async () => ({
      result: await tool.run(parsed.data),
      requests: requestCount(),
    }));
    // Validate before cache or transport. Extra keys and malformed results fail closed.
    const output = tool.output.parse({
      tool: name,
      executedAt: new Date(now()).toISOString(),
      cacheHit: false,
      requests,
      ...result,
    }) as Record<string, unknown>;
    if (result.mode !== "local") {
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: now() + CACHE_TTL_MS, value: structuredClone(output) });
    }
    return output;
  }
  return {
    list: () => listTools(definitions),
    call(name: string, args: unknown = {}): Promise<Record<string, unknown>> {
      if (waiting >= 8)
        return Promise.reject(new McpError(ErrorCode.InternalError, "Suite is busy; retry after the current call"));
      waiting++;
      const work = queue.then(() => invoke(name, args));
      queue = work.catch(() => undefined);
      return work.finally(() => {
        waiting--;
      });
    },
  };
}

/** Create a standards-based MCP server without opening a transport. @example await createServer().connect(transport) */
export function createServer(options: Parameters<typeof createSuite>[0] = {}) {
  const suite = createSuite(options);
  const server = new Server(
    { name: "flop-lab", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Read-only devnet evidence. Check mode, evidence times and limitations. Recorded data is not current state.",
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => suite.list());
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      const structuredContent = await suite.call(params.name, params.arguments ?? {});
      return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent };
    } catch (error) {
      if (error instanceof McpError) throw error;
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              tool: params.name,
              executedAt: new Date().toISOString(),
              source: "local suite dispatcher",
              error: error instanceof Error ? error.message.slice(0, 4000) : "Tool failed",
            }),
          },
        ],
      };
    }
  });
  return server;
}
