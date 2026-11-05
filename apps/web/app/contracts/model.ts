// SPDX-License-Identifier: Apache-2.0
import type { AuditReport, Status, ToolResult } from "../../../../packages/mcpaudit/src/types";
export type { AuditReport, Observation, Status, ToolResult } from "../../../../packages/mcpaudit/src/types";
export const statuses: Status[] = ["VIOLATION", "UNVERIFIABLE", "PASS", "SKIPPED"];
export const labels: Record<Status, string> = {
  VIOLATION: "Violations",
  UNVERIFIABLE: "Unverifiable",
  PASS: "Pass",
  SKIPPED: "Skipped",
};

/** Count recorded tool outcomes without inferring missing results. @example counts(report).VIOLATION */
export function counts(report: AuditReport): Record<Status, number> {
  const total: Record<Status, number> = { VIOLATION: 0, UNVERIFIABLE: 0, PASS: 0, SKIPPED: 0 };
  for (const tool of report.tools) total[tool.status]++;
  return total;
}

/** Filter stable tool names and put violations first. @example filterTools(report.tools, "VIOLATION", "knowledge") */
export function filterTools(tools: ToolResult[], filter: Status | "all", query: string): ToolResult[] {
  return tools
    .filter(
      (tool) =>
        (filter === "all" || tool.status === filter) && tool.name.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => statuses.indexOf(a.status) - statuses.indexOf(b.status) || a.name.localeCompare(b.name));
}

/** UTC formatting does not depend on browser locale. @example utc(report.measuredAt) */
export function utc(value: string): string {
  return value.replace("T", " ").replace(/\.\d+Z$/, " UTC");
}
