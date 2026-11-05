// SPDX-License-Identifier: Apache-2.0
import { object, array, text, integer } from "./validation";
import type { RunReport } from "./types";

function cell(value: string): string {
  return value
    .replaceAll("|", "\\|")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", " ")
    .replace(/[\u2013\u2014]/g, "-");
}
function fence(value: unknown): string {
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const marker = "`".repeat(Math.max(3, ...[...body.matchAll(/`+/g)].map((match) => match[0].length + 1)));
  return `${marker}text\n${body.replace(/[\u2013\u2014]/g, "-")}\n${marker}`;
}

/** Bound committed summaries while keeping references to raw recordings. @example compactReport(report) */
export function compactReport(report: RunReport): RunReport {
  return {
    ...report,
    evidence: report.evidence.map((item) => ({
      ...item,
      response: item.response.slice(0, 1024),
      responseTruncated: item.response.length > 1024,
      rawFixture: `fixtures/run-${item.id}.json`,
    })),
    results: report.results.map((result) => ({
      ...result,
      attempts: result.attempts.map((attempt) => {
        const observed = JSON.stringify(attempt.observed);
        return {
          ...attempt,
          observed:
            observed.length > 2048
              ? { excerpt: observed.slice(0, 2048), truncated: true, originalCharacters: observed.length }
              : attempt.observed,
        };
      }),
    })),
  };
}

/** Render a dated matrix with provenance and confirmation evidence. @example renderMarkdown(report) */
export function renderMarkdown(report: RunReport): string {
  const lines = [
    "# FLOP conformance run",
    "",
    `Measured: ${report.measuredAt}`,
    `Network: ${cell(report.network.name ?? "unknown")}`,
    `Genesis: ${report.network.genesisHash ?? "unavailable"}; spec version: ${report.network.specVersion ?? "unavailable"}`,
    cell(report.network.reason),
    `Requests: ${report.budget.requests}/${report.budget.maxRequests}. Spent: ${report.budget.spentFlop} FLOP.`,
    "",
    "| Claim | Result | Reason |",
    "| --- | --- | --- |",
  ];
  for (const result of report.results)
    lines.push(`| ${result.claim.id} | ${result.flaky ? "FLAKY" : result.status} | ${cell(result.reason)} |`);
  for (const result of report.results.filter((result) => result.attempts.length)) {
    lines.push(
      "",
      `## ${result.claim.id}`,
      "",
      `Expected: ${cell(result.claim.expected)}`,
      `Source: ${result.claim.source.url}`,
      `Quote: ${cell(result.claim.source.quote)}`,
      `Reproduce: \`${result.command}\``,
    );
    for (const attempt of result.attempts) {
      lines.push(
        "",
        `${attempt.status} at ${attempt.measuredAt}. Evidence: ${attempt.evidence.join(", ")}`,
        fence(attempt.observed),
      );
      if (attempt.status === "FAIL") {
        for (const id of attempt.evidence) {
          const item = report.evidence.find((item) => item.id === id);
          if (item)
            lines.push(
              fence({
                request: item.request,
                status: item.status,
                responseExcerpt: item.response.slice(0, 1024),
                truncated: item.responseTruncated === true || item.response.length > 1024,
              }),
            );
        }
      }
    }
  }
  return lines.join("\n") + "\n";
}

/** Validate imported reports before selecting evidence for a draft. @example parseReport(JSON.parse(json)) */
export function parseReport(value: unknown): RunReport {
  const report = object(value);
  if (report.version !== 1) throw new Error("Unsupported report version");
  if (!Number.isFinite(Date.parse(text(report.measuredAt)))) throw new Error("Invalid report measurement time");
  text(report.finishedAt);
  const evidenceIds = new Set<number>();
  for (const value of array(report.evidence)) {
    const item = object(value);
    const id = integer(item.id);
    if (evidenceIds.has(id)) throw new Error("Duplicate evidence id");
    evidenceIds.add(id);
    const request = object(item.request);
    text(request.url);
    text(request.method);
    object(request.headers);
    text(item.response);
    text(item.measuredAt);
  }
  const ids = new Set<string>();
  for (const value of array(report.results)) {
    const result = object(value);
    const claim = object(result.claim);
    const id = text(claim.id);
    if (!/^[a-z][a-z0-9-]+$/.test(id) || ids.has(id)) throw new Error("Invalid or duplicate claim id");
    ids.add(id);
    text(claim.expected);
    text(claim.title);
    text(object(claim.source).url);
    text(object(claim.source).quote);
    if (!["PASS", "FAIL", "UNVERIFIABLE", "SKIPPED"].includes(text(result.status)) || typeof result.flaky !== "boolean")
      throw new Error("Invalid result status");
    text(result.reason);
    text(result.command);
    for (const value of array(result.attempts)) {
      const attempt = object(value);
      if (!["PASS", "FAIL", "UNVERIFIABLE"].includes(text(attempt.status))) throw new Error("Invalid attempt status");
      text(attempt.reason);
      text(attempt.measuredAt);
      if (array(attempt.evidence).some((id) => !evidenceIds.has(integer(id))))
        throw new Error("Missing evidence reference");
    }
  }
  object(report.network);
  object(report.budget);
  return report as unknown as RunReport;
}

/** Only reproduced failures can become issue drafts. SHA must be freshly resolved by the caller. @example renderBugDraft(report, "invalid-limit", { sha, measuredAt, source }) */
export function renderBugDraft(
  report: RunReport,
  id: string,
  upstream: { sha: string; measuredAt: string; source: string },
): string {
  const result = report.results.find((result) => result.claim.id === id);
  if (
    !result ||
    result.status !== "FAIL" ||
    result.flaky ||
    result.attempts.length !== 2 ||
    result.attempts.some((attempt) => attempt.status !== "FAIL" || attempt.evidence.length === 0) ||
    result.attempts[0]?.reason !== result.attempts[1]?.reason
  )
    throw new Error("Only confirmed, reproduced FAILs with evidence can become drafts");
  if (!/^[a-f0-9]{40}$/.test(upstream.sha)) throw new Error("Current upstream default-branch SHA is unavailable");
  const ids = new Set(result.attempts.flatMap((attempt) => attempt.evidence));
  const evidence = report.evidence.filter((item) => ids.has(item.id));
  return [
    "### Commit verified against",
    "",
    `${upstream.sha}`,
    `Resolved at ${upstream.measuredAt} from ${upstream.source}. This identifies source HEAD, not the deployed service revision.`,
    "",
    "### Report",
    "",
    `${cell(result.claim.title)}. Measured at ${report.measuredAt}.`,
    `Expected: ${cell(result.claim.expected)}`,
    `Source: ${result.claim.source.url}`,
    `Quote: ${cell(result.claim.source.quote)}`,
    "",
    "Reproduction:",
    "",
    fence(result.command),
    "",
    "Observed:",
    "",
    ...result.attempts.map((attempt) =>
      fence({
        status: attempt.status,
        measuredAt: attempt.measuredAt,
        observed: attempt.observed,
        reason: attempt.reason,
      }),
    ),
    "",
    "Exact recorded requests and response excerpts:",
    "",
    ...evidence.map((item) =>
      fence({ ...item, response: item.response.slice(0, 6000), excerptTruncated: item.response.length > 6000 }),
    ),
    "",
    "### Unknown",
    "",
    "The hosted service's deployed revision, full network identity and root cause are not established. Separate reads are not an atomic snapshot. This report checks the quoted contract, not consensus or inference correctness.",
    "",
  ].join("\n");
}
