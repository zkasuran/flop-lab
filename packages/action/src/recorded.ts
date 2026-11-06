// SPDX-License-Identifier: Apache-2.0
import { checkArithmetic, parseEvidence, settlementRows } from "@flop-lab/verifier";
import { recordedReport, type Report as SpecReport } from "@flop-lab/spec";
import { analyze, parseTools, type Trace } from "@flop-lab/mcpaudit";
import { pickResponse } from "@flop-lab/mcp";
import bundle from "../../verifier/fixtures/v2-channel.json";
import discovery from "../../mcpaudit/fixtures/audit-1.json";
import stats from "../../mcpaudit/fixtures/audit-32.json";
import invalid from "../../mcpaudit/fixtures/audit-33.json";
import { result, verdict } from "./results";
import { checkNames, type CheckName, type CheckResult } from "./types";

/** Count a spec comparison while preserving gaps. @example specResult(recordedReport()) */
export function specResult(report: SpecReport): CheckResult {
  const sources = report.differences.flatMap((item) =>
    [item.spec, item.runtime].flatMap((row) =>
      row ? [{ url: row.evidence.source, measuredAt: row.evidence.measuredAt }] : [],
    ),
  );
  return result(
    "spec",
    report.differences.map((item) => verdict(item.result)),
    [...new Map(sources.map((source) => [JSON.stringify(source), source])).values()],
    report.differences
      .filter((item) => item.result !== "MATCH")
      .map((item) => `${item.name}: ${item.result}. ${item.reason}`),
  );
}

/** Replay the owning packages' raw recordings with no fetch. @example recordedCheck('tape').status */
export function recordedCheck(name: CheckName): CheckResult {
  if (!checkNames.includes(name)) throw new Error("Unknown recorded check");
  if (name === "spec") return specResult(recordedReport());
  if (name === "contracts") {
    const tool = parseTools(pickResponse(discovery.raw, discovery.request.id).result).find(
      (tool) => tool.name === "flop_get_stats",
    );
    if (!tool) throw new Error("Recorded discovery has no stats tool");
    const traces: Trace[] = [stats, invalid];
    const observations = traces.map((trace, index) =>
      analyze(tool, { label: index === 0 ? "minimal" : "invalid", args: trace.request.params?.arguments }, trace),
    );
    return result(
      name,
      observations.map((item) => verdict(item.status)),
      [discovery, ...traces].map((trace) => ({ url: trace.source, measuredAt: trace.measuredAt })),
      observations.map((item) => `${item.status}: ${item.reason}`),
    );
  }
  const evidence = parseEvidence(bundle);
  const checks = settlementRows(evidence).flatMap((row) => checkArithmetic(row));
  return result(
    name,
    checks.map((check) => verdict(check.status)),
    evidence.observations
      .filter((observation) => observation.tool === "flop_list_settlements")
      .map((observation) => ({ url: observation.source, measuredAt: observation.measuredAt })),
    [...new Set(checks.map((check) => `${check.id}: ${check.detail}`))],
  );
}
