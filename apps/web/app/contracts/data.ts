// SPDX-License-Identifier: Apache-2.0
import recording from "../../../../packages/mcpaudit/last-run.json";
import { schemaFindings } from "../../../../packages/mcpaudit/src/schema";
import type { AuditReport } from "../../../../packages/mcpaudit/src/types";

const status = { enum: ["PASS", "VIOLATION", "UNVERIFIABLE", "SKIPPED"] };
const number = { type: "number", minimum: 0 };
const time = { type: "string", format: "date-time" };
const schema = {
  type: "object",
  required: [
    "version",
    "source",
    "measuredAt",
    "finishedAt",
    "durationMs",
    "requests",
    "maxRequests",
    "spacingMs",
    "cacheTtlMs",
    "tools",
    "trust",
    "discoveryError",
  ],
  properties: {
    version: { const: 1 },
    source: { const: "https://mcp.flop.network/mcp" },
    measuredAt: time,
    finishedAt: time,
    durationMs: number,
    requests: { type: "integer", minimum: 0, maximum: 149 },
    maxRequests: { type: "integer", minimum: 1, maximum: 149 },
    spacingMs: number,
    cacheTtlMs: number,
    discoveryError: { type: ["string", "null"] },
    tools: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "status", "outputSchema", "reason", "observations"],
        properties: {
          name: { type: "string", pattern: "^flop_[a-z_]+$" },
          status,
          outputSchema: { type: "boolean" },
          reason: { type: "string" },
          observations: {
            type: "array",
            items: {
              type: "object",
              required: [
                "tool",
                "probe",
                "status",
                "reason",
                "findings",
                "traceIds",
                "measuredAt",
                "durationMs",
                "bytes",
                "confirmed",
              ],
              properties: {
                tool: { type: "string" },
                status,
                reason: { type: "string" },
                measuredAt: { anyOf: [time, { type: "null" }] },
                durationMs: number,
                bytes: number,
                confirmed: { type: "boolean" },
                probe: {
                  type: "object",
                  required: ["label", "args"],
                  properties: { label: { enum: ["minimal", "boundary", "invalid"] }, args: {} },
                },
                traceIds: { type: "array", items: { type: "integer", minimum: 1 } },
                findings: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["kind", "message", "schemaPath", "instancePath", "value"],
                    properties: {
                      kind: { enum: ["input", "output", "agreement", "envelope"] },
                      message: { type: "string" },
                      schemaPath: { type: "string" },
                      instancePath: { type: "string" },
                      value: {},
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    trust: {
      type: "object",
      required: [
        "version",
        "snapshotHash",
        "models",
        "dstackVkeys",
        "platforms",
        "tcb",
        "missing",
        "advisoryComparison",
        "sources",
      ],
      properties: {
        missing: { type: "array", items: { type: "string" } },
        advisoryComparison: { type: "array", items: { type: "string" } },
        sources: {
          type: "array",
          items: {
            type: "object",
            required: ["url", "measuredAt"],
            properties: {
              url: { type: "string", pattern: "^https://" },
              measuredAt: { anyOf: [time, { type: "null" }] },
            },
          },
        },
      },
    },
  },
};

/** Validate a dated recording before rendering. Invalid data produces a no-data state. @example readRecording() */
export function readRecording(value: unknown = recording): AuditReport | null {
  try {
    if (schemaFindings(schema, value, "output").length) return null;
    const report = value as AuditReport;
    if (
      report.requests > report.maxRequests ||
      new Set(report.tools.map((tool) => tool.name)).size !== report.tools.length
    )
      return null;
    for (const tool of report.tools) {
      if (
        tool.observations.some(
          (observation) => observation.tool !== tool.name || observation.traceIds.some((id) => id > report.requests),
        )
      )
        return null;
      const expected = tool.observations.some((o) => o.status === "VIOLATION")
        ? "VIOLATION"
        : tool.observations.some((o) => o.status === "UNVERIFIABLE")
          ? "UNVERIFIABLE"
          : "PASS";
      if (tool.observations.length && tool.status !== expected) return null;
    }
    return report;
  } catch {
    return null;
  }
}
