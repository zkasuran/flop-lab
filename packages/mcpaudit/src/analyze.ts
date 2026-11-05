// SPDX-License-Identifier: Apache-2.0
import { isDeepStrictEqual } from "node:util";
import { pickResponse } from "@flop-lab/mcp";
import { object, schemaFindings } from "./schema";
import type { Finding, Observation, Probe, Tool, Trace } from "./types";

/** Judge one response against its advertised contract. @example analyze(tool, probe, trace) */
export function analyze(tool: Tool, probe: Probe, trace: Trace): Observation {
  const base = {
    tool: tool.name,
    probe,
    traceIds: [trace.id],
    measuredAt: trace.measuredAt,
    durationMs: trace.durationMs,
    bytes: trace.bytes,
    confirmed: false,
  };
  const done = (status: Observation["status"], reason: string, findings: Finding[] = []): Observation => ({
    ...base,
    status,
    reason,
    findings,
  });
  if (trace.truncated || trace.status !== 200)
    return done(
      "UNVERIFIABLE",
      `Transport response HTTP ${trace.status}${trace.truncated ? "; body exceeded capture limit" : ""}. This does not establish a contract violation.`,
    );
  try {
    const message = pickResponse(trace.raw, trace.request.id);
    const inputErrors = schemaFindings(tool.inputSchema, probe.args, "input");
    const result = message.result === undefined ? null : object(message.result);
    const content = result?.content;
    const texts = Array.isArray(content)
      ? content
          .filter(
            (item): item is { type: "text"; text: string } =>
              !!item &&
              typeof item === "object" &&
              object(item).type === "text" &&
              typeof object(item).text === "string",
          )
          .map((item) => item.text)
      : [];
    const rejected = message.error !== undefined || result?.isError === true;
    if (probe.label === "invalid") {
      if (!inputErrors.length) return done("UNVERIFIABLE", "Probe was not invalid under this schema.");
      if (message.error && ![-32600, -32602].includes(message.error.code ?? 0))
        return done("UNVERIFIABLE", "RPC failure does not establish input validation.");
      const clearError =
        (typeof message.error?.message === "string" && message.error.message.trim().length > 0) ||
        (result?.isError === true && texts.some((text) => text.trim().length > 0));
      if (rejected && clearError) return done("PASS", "Locally invalid input was refused with an error message.");
      if (!result && !rejected) return done("UNVERIFIABLE", "No result or error envelope.");
      return done(
        "VIOLATION",
        rejected
          ? "Invalid input was refused without an error message."
          : "Server accepted input forbidden by inputSchema.",
        inputErrors,
      );
    }
    if (inputErrors.length) return done("UNVERIFIABLE", "Safe probe no longer satisfies inputSchema.");
    if (rejected)
      return done(
        "UNVERIFIABLE",
        `Schema-valid input received a domain error: ${message.error?.message ?? texts.join("\n").slice(0, 400)}. Schema validity alone does not promise a record exists.`,
      );
    if (!result)
      return done("VIOLATION", "Missing result envelope.", [
        {
          kind: "envelope",
          schemaPath: "MCP/tools/call/result",
          instancePath: "",
          value: null,
          message: "Missing tool result",
        },
      ]);
    const findings: Finding[] = [];
    if (
      !Array.isArray(content) ||
      content.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          typeof object(item).type !== "string" ||
          (object(item).type === "text" && typeof object(item).text !== "string"),
      ) ||
      (result.isError !== undefined && typeof result.isError !== "boolean")
    )
      findings.push({
        kind: "envelope",
        schemaPath: "MCP/CallToolResult",
        instancePath: "/content",
        value: content ?? null,
        message: "Malformed tool result content",
      });
    const structured = result.structuredContent;
    if (tool.outputSchema) findings.push(...schemaFindings(tool.outputSchema, structured, "output"));
    let agreement = "No structuredContent to compare with text.";
    if (structured !== undefined) {
      let equal = false;
      let conflicting = false;
      for (const text of texts) {
        try {
          if (isDeepStrictEqual(JSON.parse(text), structured)) equal = true;
          else conflicting = true;
        } catch {
          /* Non-JSON text cannot establish equality. */
        }
      }
      if (!equal || conflicting)
        findings.push({
          kind: "agreement",
          schemaPath: "MCP/structuredContent",
          instancePath: "/content",
          value: texts.map((text) => text.slice(0, 1000)),
          message: conflicting
            ? "A text JSON block contradicts structuredContent"
            : "No text JSON block agrees with structuredContent",
        });
      agreement = "Text JSON agrees with structuredContent.";
    }
    if (findings.length) return done("VIOLATION", "Response contradicts its advertised contract.", findings);
    if (!tool.outputSchema) return done("UNVERIFIABLE", `No outputSchema was advertised. ${agreement}`);
    return done("PASS", `Output matches outputSchema. ${agreement}`);
  } catch (error) {
    return done("UNVERIFIABLE", `Cannot evaluate response: ${error instanceof Error ? error.message : String(error)}`);
  }
}
