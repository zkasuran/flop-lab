// SPDX-License-Identifier: Apache-2.0
import { pickResponse, type McpToolInfo } from "@flop-lab/mcp";
import { Transport } from "./transport";
import { array, object, schemaErrors } from "./validation";

export const CACHE_TTL_MS = 30_000;
export class Unavailable extends Error {}
interface Cached {
  value: unknown;
  at: number;
  evidence: number[];
}

export class Context {
  private readonly cache = new Map<string, Cached>();
  readonly used = new Set<number>();
  constructor(readonly transport: Transport) {}
  fresh(): void {
    this.cache.clear();
  }
  async read(key: string, operation: () => Promise<unknown>): Promise<unknown> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      cached.evidence.forEach((id) => this.used.add(id));
      return cached.value;
    }
    const start = this.transport.evidence.length;
    try {
      const value = await operation();
      const evidence = this.transport.evidence.slice(start).map((item) => item.id);
      this.cache.set(key, { value, at: Date.now(), evidence });
      return value;
    } finally {
      this.transport.evidence.slice(start).forEach((item) => this.used.add(item.id));
    }
  }
  async tools(): Promise<(McpToolInfo & { outputSchema?: unknown })[]> {
    const result = await this.read("tools", async () => (await this.transport.client.listTools()).value);
    return array(result).map((value) => {
      const tool = object(value);
      if (typeof tool.name !== "string" || !tool.inputSchema || typeof tool.description !== "string")
        throw new Error("Invalid tools/list entry");
      object(tool.inputSchema);
      return tool as unknown as McpToolInfo & { outputSchema?: unknown };
    });
  }
  async call(name: string, args: Record<string, unknown> = {}, invalid = false): Promise<unknown> {
    const tool = (await this.tools()).find((tool) => tool.name === name);
    if (!tool || tool.annotations?.readOnlyHint !== true || /secret/i.test(name))
      throw new Unavailable("Tool is not an allowed advertised read-only tool");
    if (!invalid && schemaErrors(tool.inputSchema, args).length)
      throw new Unavailable("Input does not satisfy the advertised tool schema");
    return this.read(
      `${name}:${JSON.stringify(args)}`,
      async () => (await this.transport.client.callTool(name, args)).value,
    );
  }
  models(): Promise<unknown> {
    return this.read("models", () => this.transport.models());
  }
  structuredOutput(name: string): unknown {
    for (const item of [...this.transport.evidence].reverse()) {
      if (!this.used.has(item.id) || !item.request.body) continue;
      const request = object(JSON.parse(item.request.body));
      if (!request.params || object(request.params).name !== name) continue;
      const response = object(pickResponse(item.response, Number(request.id)).result);
      if (!("structuredContent" in response))
        throw new Unavailable("Advertised output schema has no structuredContent response to validate");
      return response.structuredContent;
    }
    throw new Unavailable("No recorded structured response is available");
  }
  async args(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value !== "string" || !value.startsWith("$")) {
        resolved[key] = value;
        continue;
      }
      let field: unknown;
      if (value === "$model") {
        const models = array(object(await this.call("flop_discover_models")).models).map(object);
        field = (models.find((model) => model.served === true) ?? models[0])?.modelHash;
      } else if (value === "$block") {
        field = object(object(await this.call("flop_get_stats")).stats).latestBlockNumber;
      } else if (["$agent", "$miner", "$channel"].includes(value)) {
        const row = array(object(await this.call("flop_list_settlements", { limit: 1 })).data)[0];
        if (row) field = object(row)[value === "$channel" ? "channelId" : value.slice(1)];
      } else if (value === "$hashlock") {
        const rows = array(
          object(await this.call("flop_indexer_query", { query: "{ htlcs(limit: 1) { hashLock } }" })).htlcs,
        );
        if (rows[0]) field = object(rows[0]).hashLock;
      } else if (value === "$skill") {
        const manifest = object(await this.call("flop_agent_pack_manifest"));
        const rows = array(manifest.skills);
        if (rows[0]) field = object(rows[0]).id;
      } else if (value === "$concept") {
        const results = array(
          object(await this.call("flop_knowledge_search", { query: "protocol", limit: 1 })).results,
        );
        if (results[0]) field = object(results[0]).id;
      }
      if (field === undefined || field === null) throw new Unavailable(`No observed input for ${value}`);
      resolved[key] = field;
    }
    return resolved;
  }
}
