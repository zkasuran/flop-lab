// SPDX-License-Identifier: Apache-2.0
import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Report } from "./types";

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;")
    .replace(/[\r\n]/g, " ");

/** Render counted outcomes and dated sources for a GitHub job. @example jobSummary(report) */
export function jobSummary(report: Report): string {
  return [
    "## flop-lab check",
    "",
    `Result: **${report.status}**. Mode: **${report.mode}**.`,
    `Evaluated: ${report.evaluatedAt}. HTTP attempts: ${report.requests} / ${report.maxRequests}.`,
    "",
    "| Check | Result | Pass | Fail | Incomplete |",
    "| --- | --- | ---: | ---: | ---: |",
    ...report.checks.map(
      (check) => `| ${check.name} | ${check.status} | ${check.pass} | ${check.fail} | ${check.incomplete} |`,
    ),
    "",
    ...report.checks.flatMap((check) => [
      `### ${check.name}`,
      ...check.sources.map((source) => `- ${escape(source.measuredAt)} from ${escape(source.url)}`),
      ...check.details.slice(0, 8).map((detail) => `- ${escape(detail).slice(0, 600)}`),
      "",
    ]),
    "Tape checks reported arithmetic only. Spec gaps remain incomplete. Contracts checks only flop_get_stats. This does not verify inference or consensus.",
    "",
  ].join("\n");
}

/** Write a report and runner protocol files without interpolating shell commands. @example await writeGithub(report, process.env) */
export async function writeGithub(report: Report, env: Record<string, string | undefined>): Promise<string> {
  if (!env.GITHUB_OUTPUT || !env.GITHUB_STEP_SUMMARY) throw new Error("GitHub output and summary paths are required");
  const dir = await mkdtemp(join(env.RUNNER_TEMP ?? tmpdir(), "flop-lab-check-"));
  const path = join(dir, "report.json");
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  await appendFile(env.GITHUB_OUTPUT, `status=${report.status}\nrequests=${report.requests}\nreport=${path}\n`);
  await appendFile(env.GITHUB_STEP_SUMMARY, jobSummary(report));
  return path;
}
