// SPDX-License-Identifier: Apache-2.0
import { McpClient, McpError, DEFAULT_URL, pickResponse } from "@flop-lab/mcp";
import { analyze } from "./analyze";
import { object, parseTools } from "./schema";
import { planProbes } from "./probes";
import { inspectTrust } from "./trust";
import type { AuditReport, Observation, Probe, Tool, ToolResult, Trace } from "./types";

export interface AuditOptions {
  tool?: string;
  maxRequests?: number;
  minIntervalMs?: number;
  fetch?: typeof fetch;
  onTrace?: (trace: Trace) => Promise<void> | void;
}

function valueOf(trace: Trace | undefined): unknown {
  if (!trace || trace.truncated || trace.status !== 200) return null;
  try {
    const result = object(pickResponse(trace.raw, trace.request.id).result);
    if (result.isError) return null;
    if (result.structuredContent !== undefined) return result.structuredContent;
    const content = result.content;
    if (Array.isArray(content)) {
      for (const item of content) {
        const entry = object(item);
        if (entry.type === "text" && typeof entry.text === "string") return JSON.parse(entry.text);
      }
    }
  } catch {
    /* Unusable response stays unavailable. */
  }
  return null;
}

/** Run a bounded audit with the shared MCP transport. No cross-run cache. @example await runAudit({tool: "flop_knowledge_get"}) */
export async function runAudit(options: AuditOptions = {}): Promise<AuditReport> {
  const maxRequests = options.maxRequests ?? 149;
  const spacingMs = options.minIntervalMs ?? 500;
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 149)
    throw new Error("maxRequests must be an integer from 1 through 149");
  if (!Number.isFinite(spacingMs) || spacingMs < 0) throw new Error("minIntervalMs must be nonnegative");
  const start = performance.now();
  const measuredAt = new Date().toISOString();
  const traces: Trace[] = [];
  let requests = 0;
  let lastTrace: Trace | undefined;
  const client = new McpClient({
    retries: 1,
    minIntervalMs: spacingMs,
    timeoutMs: 15_000,
    fetch: async (url, init) => {
      if (requests >= maxRequests) throw new McpError("Audit request budget exhausted", "protocol");
      requests++;
      const requestStart = performance.now();
      const response = await (options.fetch ?? fetch)(url, init);
      // Capture inside fetch so the shared client's deadline also bounds body reads.
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      let truncated = false;
      if (reader)
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 2_000_000) {
            truncated = true;
            await reader.cancel();
            break;
          }
          chunks.push(part.value);
        }
      const raw = new TextDecoder().decode(Buffer.concat(chunks));
      const trace: Trace = {
        id: requests,
        source: String(url),
        measuredAt: new Date().toISOString(),
        durationMs: Math.round((performance.now() - requestStart) * 100) / 100,
        status: response.status,
        bytes,
        request: JSON.parse(String(init?.body)) as Trace["request"],
        raw,
        truncated,
      };
      traces.push(trace);
      lastTrace = trace;
      await options.onTrace?.(trace);
      if (truncated) throw new McpError("Response exceeds 2 MB capture limit", "protocol");
      return new Response(raw, { status: response.status, headers: response.headers });
    },
  });
  const results: ToolResult[] = [];
  let discoveryError: string | null = null;
  let root: unknown = null;
  let tcb: unknown = null;
  const seeds: Record<string, string> = {};
  async function call(tool: Tool, probe: Probe): Promise<Observation> {
    const before = traces.length;
    lastTrace = undefined;
    let failure: string | null = null;
    try {
      await client.callTool(tool.name, probe.args as Record<string, unknown>);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    const attempts = traces.slice(before);
    const trace = attempts.at(-1);
    if (!trace)
      return {
        tool: tool.name,
        probe,
        status: "UNVERIFIABLE",
        reason: failure ?? "No response captured",
        findings: [],
        traceIds: [],
        measuredAt: null,
        durationMs: 0,
        bytes: 0,
        confirmed: false,
      };
    const observation = analyze(tool, probe, trace);
    observation.traceIds = attempts.map((attempt) => attempt.id);
    observation.durationMs = attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0);
    observation.bytes = attempts.reduce((sum, attempt) => sum + attempt.bytes, 0);
    return observation;
  }
  try {
    await client.listTools();
    if (!lastTrace) throw new Error("No discovery response");
    const tools = parseTools(pickResponse(lastTrace.raw, lastTrace.request.id).result);
    if (!tools.length) throw new Error("No tools advertised. No contracts could be checked.");
    if (options.tool && !tools.some((tool) => tool.name === options.tool))
      throw new Error(`Unknown tool: ${options.tool}`);
    // Discovery helpers precede their consumers, but are never called outside a --tool filter.
    const ordered = [...tools].sort((a, b) => {
      const rank = (name: string) =>
        ["flop_list_settlements", "flop_knowledge_search", "flop_agent_pack_manifest"].includes(name) ? -1 : 0;
      return rank(a.name) - rank(b.name);
    });
    for (const tool of ordered.filter((tool) => !options.tool || tool.name === options.tool)) {
      let probes: Probe[];
      try {
        probes = planProbes(tool, seeds);
      } catch (error) {
        results.push({
          name: tool.name,
          status: "UNVERIFIABLE",
          outputSchema: !!tool.outputSchema,
          reason: String(error),
          observations: [],
        });
        continue;
      }
      if (!probes.length) {
        results.push({
          name: tool.name,
          status: "SKIPPED",
          outputSchema: !!tool.outputSchema,
          reason:
            "Outside the explicit read-only probe allowlist. Material generation and unknown operations are excluded.",
          observations: [],
        });
        continue;
      }
      const observations: Observation[] = [];
      for (const probe of probes) {
        const observation = await call(tool, probe);
        if (probe.label === "minimal") {
          const value = valueOf(lastTrace);
          if (tool.name === "flop_trust_root") root = value;
          if (tool.name === "flop_get_tcb_status") tcb = value;
          if (value && typeof value === "object") {
            const data = value as Record<string, unknown>;
            if (tool.name === "flop_list_settlements" && Array.isArray(data.data)) {
              const first = data.data[0] as Record<string, unknown> | undefined;
              if (typeof first?.channelId === "string") seeds.channel = first.channelId;
              if (typeof first?.agent === "string") seeds.address = first.agent;
            }
            if (tool.name === "flop_knowledge_search" && Array.isArray(data.results)) {
              const first = data.results[0] as Record<string, unknown> | undefined;
              if (typeof first?.id === "string") seeds.concept = first.id;
            }
            if (tool.name === "flop_agent_pack_manifest" && Array.isArray(data.skills)) {
              const first = data.skills[0] as Record<string, unknown> | undefined;
              if (typeof first?.id === "string") seeds.skill = first.id;
            }
          }
        }
        if (observation.status === "VIOLATION" && requests < maxRequests) {
          const repeat = await call(tool, probe);
          observation.confirmed =
            repeat.status === "VIOLATION" &&
            JSON.stringify(repeat.findings.map((f) => [f.kind, f.schemaPath, f.instancePath])) ===
              JSON.stringify(observation.findings.map((f) => [f.kind, f.schemaPath, f.instancePath]));
          observations.push(observation, repeat);
        } else observations.push(observation);
      }
      const status = observations.some((item) => item.status === "VIOLATION")
        ? "VIOLATION"
        : observations.some((item) => item.status === "UNVERIFIABLE")
          ? "UNVERIFIABLE"
          : "PASS";
      results.push({
        name: tool.name,
        status,
        outputSchema: !!tool.outputSchema,
        reason: tool.outputSchema
          ? "See individual probes and schema findings."
          : "No outputSchema advertised. Input refusal is checked separately.",
        observations,
      });
    }
  } catch (error) {
    discoveryError = error instanceof Error ? error.message : String(error);
  }
  return {
    version: 1,
    source: DEFAULT_URL,
    measuredAt,
    finishedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - start),
    requests,
    maxRequests,
    spacingMs,
    cacheTtlMs: 0,
    discoveryError,
    tools: results.sort((a, b) => a.name.localeCompare(b.name)),
    trust: inspectTrust(root, tcb, measuredAt),
  };
}
