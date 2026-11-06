// SPDX-License-Identifier: Apache-2.0
import { McpClient, McpError, DEFAULT_URL } from "@flop-lab/mcp";
import { parseManifest, parseDocument, parseSearch, parseRequirement, parseOpaque } from "./schema";

export interface Observation<T> {
  source: string;
  tool: string;
  args: Record<string, unknown>;
  measuredAt: string;
  status: "reported" | "unavailable" | "invalid";
  raw: string;
  value?: T;
  error?: string;
}
export const CACHE_TTL_MS = 300_000;
export const tools = {
  manifest: "flop_knowledge_manifest",
  concept: "flop_knowledge_get",
  search: "flop_knowledge_search",
  explain: "flop_explain_requirement",
  pack: "flop_agent_pack_manifest",
  skill: "flop_agent_skill_get",
  guidance: "flop_agent_pack_install",
  card: "flop_get_agent_card",
} as const;
export type Operation = keyof typeof tools;

function input(value: string): string {
  if (!value.trim() || value.length > 256 || [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))
    throw new Error("Input must be nonempty text of at most 256 characters without control characters");
  return value;
}

/** Read-only knowledge service with bounded process-local TTL and in-flight caching. @example await new KnowledgeClient().manifest() */
export class KnowledgeClient {
  readonly mcp: McpClient;
  private cache = new Map<string, { until: number; result: Observation<unknown> }>();
  private pending = new Map<string, Promise<Observation<unknown>>>();
  constructor(private options: { client?: McpClient; now?: () => number } = {}) {
    this.mcp = options.client ?? new McpClient({ retries: 1, timeoutMs: 15_000, minIntervalMs: 500 });
  }
  private now() {
    return (this.options.now ?? Date.now)();
  }
  private async read<T>(
    operation: Operation,
    args: Record<string, unknown>,
    parse: (v: unknown) => T,
  ): Promise<Observation<T>> {
    const tool = tools[operation];
    const key = JSON.stringify([tool, args]);
    const cached = this.cache.get(key);
    if (cached && this.now() < cached.until) return structuredClone(cached.result) as Observation<T>;
    const existing = this.pending.get(key);
    if (existing) return structuredClone(await existing) as Observation<T>;
    const request = (async (): Promise<Observation<T>> => {
      let observation: Observation<T>;
      try {
        const result = await this.mcp.callTool(tool, args);
        observation = {
          source: DEFAULT_URL,
          tool,
          args,
          measuredAt: result.measuredAt,
          status: "reported",
          raw: result.raw,
        };
        try {
          observation.value = parse(result.value);
        } catch (error) {
          observation.status = "invalid";
          observation.error = error instanceof Error ? error.message : String(error);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        observation = {
          source: DEFAULT_URL,
          tool,
          args,
          measuredAt: new Date(this.now()).toISOString(),
          status: "unavailable",
          raw: error instanceof McpError && error.kind === "tool" ? message : "",
          error: message,
        };
      }
      if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { until: this.now() + CACHE_TTL_MS, result: observation });
      return observation;
    })();
    this.pending.set(key, request);
    try {
      return structuredClone(await request);
    } finally {
      this.pending.delete(key);
    }
  }
  /** Fetch the full manifest. @example await client.manifest() */
  manifest() {
    return this.read("manifest", {}, parseManifest);
  }
  /** Fetch one concept as inert text. @example await client.concept("overview") */
  concept(id: string) {
    return this.read("concept", { id_or_path: input(id) }, (value) => {
      const doc = parseDocument(value);
      const ref = id.startsWith("/") ? id.slice(1) : id;
      if (doc.concept.id !== ref && doc.concept.path !== ref)
        throw new Error("Concept response does not match the requested ID or path");
      return doc;
    });
  }
  /** Search the service with its own scores. @example await client.search("agent", 5) */
  search(query: string, limit = 8) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("Limit must be an integer from 1 to 20");
    return this.read("search", { query: input(query), limit }, parseSearch);
  }
  /** Inspect a cited requirement. @example await client.explain("R9.5") */
  explain(id: string) {
    return this.read("explain", { id: input(id) }, (value) => {
      const result = parseRequirement(value);
      if (result.key !== id) throw new Error("Requirement response does not match the requested key");
      return result;
    });
  }
  /** Inspect pack metadata without installation. @example await client.pack() */
  pack() {
    return this.read("pack", {}, parseOpaque);
  }
  /** Fetch skill text without executing it. @example await client.skill("flop-knowledge-catalog") */
  skill(id: string) {
    return this.read("skill", { id_or_path: input(id) }, parseOpaque);
  }
  /** Read generic remote install guidance only. @example await client.guidance() */
  guidance() {
    return this.read("guidance", { target: "generic", mode: "remote" }, parseOpaque);
  }
  /** Read one card. No endpoint in the response is followed. @example await client.card("0x" + "0".repeat(64)) */
  card(id: string) {
    if (!/^0x[\da-fA-F]{64}$/.test(id)) throw new Error("Agent ID must be a 0x-prefixed H256");
    return this.read("card", { agent_id: id }, parseOpaque);
  }
}
