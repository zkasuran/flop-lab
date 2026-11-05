// SPDX-License-Identifier: Apache-2.0
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pickResponse } from "@flop-lab/mcp";
import { analyze, parseTools, planProbes, runAudit, schemaFindings, inspectTrust } from "../src/index";
import { parseIntelAdvisory } from "../src/intel";
import type { Probe, Tool, Trace } from "../src/types";
import { traces } from "./fixtures";

const discovery = traces.find((trace) => trace.request.method === "tools/list")!;
const tools = parseTools(pickResponse(discovery.raw, discovery.request.id).result);
const tool: Tool = {
  name: "flop_health",
  annotations: { readOnlyHint: true },
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  },
};
const valid: Probe = { label: "minimal", args: {} };
function trace(result: unknown, status = 200): Trace {
  return {
    id: 1,
    source: "https://mcp.flop.network/mcp",
    measuredAt: "2026-11-05T00:00:00Z",
    durationMs: 1,
    status,
    bytes: 1,
    request: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.name, arguments: {} } },
    raw: JSON.stringify({ jsonrpc: "2.0", id: 1, result }),
    truncated: false,
  };
}
const result = (value: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  structuredContent: value,
});

describe("recorded public contracts", () => {
  it("validates every probe locally and never plans material generation or unknown tools", () => {
    for (const tool of tools)
      for (const probe of planProbes(tool))
        expect(schemaFindings(tool.inputSchema, probe.args, "input").length > 0).toBe(probe.label === "invalid");
    expect(planProbes({ ...tool, name: "flop_unknown" })).toEqual([]);
    expect(planProbes({ ...tool, annotations: { readOnlyHint: false } })).toEqual([]);
    expect(tools.filter((tool) => planProbes(tool).length === 0)).toHaveLength(1);
  });
  it.each(["flop_knowledge_get", "flop_knowledge_manifest"])(
    "reproduces %s with exact schema paths from independent raw replies",
    (name) => {
      const spec = tools.find((tool) => tool.name === name)!;
      const records = traces.filter(
        (trace) =>
          trace.request.params?.name === name &&
          !JSON.stringify(trace.request.params.arguments).includes("null") &&
          !Array.isArray(trace.request.params.arguments),
      );
      const violations = records
        .map((t) => analyze(spec, { label: "minimal", args: t.request.params!.arguments }, t))
        .filter((o) => o.status === "VIOLATION");
      expect(violations).toHaveLength(2);
      expect(violations[0]!.findings.some((finding) => finding.schemaPath.endsWith("additionalProperties"))).toBe(true);
      expect(violations[0]!.findings.some((finding) => finding.instancePath.endsWith("generated_by"))).toBe(true);
      expect(violations[0]!.findings.map((f) => f.instancePath)).toEqual(
        violations[1]!.findings.map((f) => f.instancePath),
      );
    },
  );
  it("keeps raw fixture files below the byte ceiling and retains source and time", () => {
    const directory = new URL("../fixtures/", import.meta.url);
    for (const name of readdirSync(directory))
      expect(statSync(new URL(name, directory)).size, name).toBeLessThan(200_000);
    for (const trace of traces) {
      expect(trace.source).toBe("https://mcp.flop.network/mcp");
      expect(Number.isFinite(Date.parse(trace.measuredAt))).toBe(true);
      expect(trace.truncated).toBe(false);
    }
  });
});

describe("hostile and empty results", () => {
  it("accepts matching outputs without modifying them", () => {
    const data = { ok: true };
    expect(analyze(tool, valid, trace(result(data))).status).toBe("PASS");
    expect(data).toEqual({ ok: true });
  });
  it("detects forbidden fields and does not strip them", () => {
    const data = { ok: true, extra: "caught" };
    const observation = analyze(tool, valid, trace(result(data)));
    expect(observation.status).toBe("VIOLATION");
    expect(observation.findings[0]).toMatchObject({
      schemaPath: "#/additionalProperties",
      instancePath: "/extra",
      value: "caught",
    });
    expect(data.extra).toBe("caught");
  });
  it("honours permissive additionalProperties and does not invent restrictions", () => {
    expect(schemaFindings({ type: "object", properties: {} }, { extra: 1 }, "output")).toEqual([]);
  });
  it("detects missing required fields, wrong types and missing structured output", () => {
    for (const data of [{}, { ok: "true" }, null])
      expect(analyze(tool, valid, trace(result(data))).status).toBe("VIOLATION");
    expect(analyze(tool, valid, trace({ content: [{ type: "text", text: "{}" }] })).status).toBe("VIOLATION");
  });
  it("compares JSON meaning rather than key order", () => {
    const t = { ...tool, outputSchema: { type: "object" } };
    expect(
      analyze(
        t,
        valid,
        trace({ structuredContent: { a: 1, b: 2 }, content: [{ type: "text", text: '{"b":2,"a":1}' }] }),
      ).status,
    ).toBe("PASS");
  });
  it("detects conflicting text and checks every available JSON block", () => {
    expect(
      analyze(tool, valid, trace({ ...result({ ok: true }), content: [{ type: "text", text: '{"ok":false}' }] }))
        .findings[0]!.kind,
    ).toBe("agreement");
    expect(
      analyze(
        tool,
        valid,
        trace({
          ...result({ ok: true }),
          content: [
            { type: "text", text: '{"ok":true}' },
            { type: "text", text: '{"ok":false}' },
          ],
        }),
      ).status,
    ).toBe("VIOLATION");
  });
  it("distinguishes a domain error, absent schema and transport failure from violations", () => {
    expect(analyze(tool, valid, trace({ content: [{ type: "text", text: "not found" }], isError: true })).status).toBe(
      "UNVERIFIABLE",
    );
    const { outputSchema: _schema, ...withoutSchema } = tool;
    expect(analyze(withoutSchema, valid, trace(result({ ok: true }))).status).toBe("UNVERIFIABLE");
    expect(analyze(tool, valid, trace(result({}), 503)).status).toBe("UNVERIFIABLE");
    expect(analyze(tool, valid, { ...trace(result({})), raw: "garbage" }).status).toBe("UNVERIFIABLE");
  });
  it("requires invalid inputs to be refused with a clear error", () => {
    const invalid: Probe = { label: "invalid", args: [] };
    expect(analyze(tool, invalid, trace(result({ ok: true }))).status).toBe("VIOLATION");
    expect(analyze(tool, invalid, trace({ isError: true, content: [] })).status).toBe("VIOLATION");
    expect(
      analyze(tool, invalid, trace({ isError: true, content: [{ type: "text", text: "Expected object" }] })).status,
    ).toBe("PASS");
  });
  it("rejects malformed or duplicate discovery tools", () => {
    expect(parseTools({ tools: [] })).toEqual([]);
    for (const data of [null, {}, { tools: [tool, tool] }, { tools: [{ name: "flop_unknown" }] }])
      expect(() => parseTools(data)).toThrow();
  });
  it("fails closed on schemas it cannot compile", () => {
    expect(() => schemaFindings({ $schema: "https://invalid.test/dialect" }, {}, "output")).toThrow();
  });
});

describe("request budget and offline behavior", () => {
  it.each([undefined, "flop_knowledge_get"])(
    "runs the recorded transport end to end with filter %s",
    async (selected) => {
      const seen: string[] = [];
      const report = await runAudit({
        tool: selected,
        minIntervalMs: 0,
        fetch: async (_url, init) => {
          const request = JSON.parse(String(init?.body)) as Trace["request"];
          const record = traces.find(
            (trace) =>
              trace.request.method === request.method &&
              JSON.stringify(trace.request.params) === JSON.stringify(request.params),
          );
          if (!record) throw new Error(`Unrecorded request: ${String(init?.body)}`);
          if (request.params) seen.push(request.params.name);
          return new Response(JSON.stringify({ ...pickResponse(record.raw, record.request.id), id: request.id }), {
            status: record.status,
          });
        },
      });
      expect(report.discoveryError).toBeNull();
      expect(report.requests).toBe(selected ? 5 : 96);
      expect(report.tools.filter((tool) => tool.status === "VIOLATION")).toHaveLength(selected ? 1 : 2);
      expect(
        report.tools.flatMap((tool) => tool.observations).filter((observation) => observation.confirmed),
      ).toHaveLength(selected ? 1 : 2);
      if (selected) expect(new Set(seen)).toEqual(new Set([selected]));
      else expect(report.tools).toHaveLength(tools.length);
    },
  );
  it("counts retry attempts and never exceeds its hard budget", async () => {
    let calls = 0;
    const report = await runAudit({
      maxRequests: 1,
      minIntervalMs: 0,
      fetch: async () => {
        calls++;
        return new Response("busy", { status: 503 });
      },
    });
    expect(calls).toBe(1);
    expect(report.requests).toBe(1);
    expect(report.discoveryError).not.toBeNull();
  });
  it("filters before making tool calls and handles an empty discovery", async () => {
    const report = await runAudit({
      fetch: async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } })),
      minIntervalMs: 0,
    });
    expect(report.tools).toEqual([]);
    expect(report.requests).toBe(1);
    expect(report.discoveryError).toContain("No tools advertised");
    await expect(runAudit({ maxRequests: 150 })).rejects.toThrow();
  });
});

it("uses recorded Intel dates and exposes empty keys", () => {
  const root = {
    version: 2,
    snapshotHash: "hash",
    models: [{ modelHash: "model", supportedTeePlatforms: [0] }],
    dstackVkeys: [],
  };
  const trust = inspectTrust(
    root,
    { latestTCB: { advisory: "INTEL-SA-00219", releaseDate: "2025-12-15" } },
    discovery.measuredAt,
  );
  expect(trust.missing.join(" ")).toContain("No dstack verification keys");
  expect(trust.platforms).toEqual([{ modelHash: "model", platformIds: [0] }]);
  expect(trust.advisoryComparison.join(" ")).toContain("2019-11-12");
  expect(trust.advisoryComparison.join(" ")).toContain("does not match");
  const raw = JSON.parse(readFileSync(new URL("../fixtures/intel-raw.json", import.meta.url), "utf8")) as {
    raw: string;
  }[];
  expect(parseIntelAdvisory(raw[0]!.raw)).toMatchObject({
    id: "INTEL-SA-00219",
    originalRelease: "2019-11-12",
    lastRevised: "2019-11-20",
  });
  expect(() => parseIntelAdvisory("Access denied")).toThrow();
});
