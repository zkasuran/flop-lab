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
  if (!Number.isFinite(Date.parse(text(report.finishedAt)))) throw new Error("Invalid report completion time");
  integer(report.durationMs);
  array(report.source).forEach(text);
  const evidenceIds = new Set<number>();
  for (const value of array(report.evidence)) {
    const item = object(value);
    const id = integer(item.id);
    if (evidenceIds.has(id)) throw new Error("Duplicate evidence id");
    evidenceIds.add(id);
    const request = object(item.request);
    text(request.url);
    text(request.method);
    Object.values(object(request.headers)).forEach(text);
    if (request.body !== undefined) text(request.body);
    text(item.response);
    if (!Number.isFinite(Date.parse(text(item.measuredAt)))) throw new Error("Invalid evidence time");
    integer(item.durationMs);
    if (item.status !== null && (integer(item.status) < 100 || integer(item.status) > 599))
      throw new Error("Invalid HTTP status");
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
    if (!["read-only", "spends-test-funds"].includes(text(claim.risk))) throw new Error("Invalid risk class");
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
      if (!Number.isFinite(Date.parse(text(attempt.measuredAt)))) throw new Error("Invalid attempt time");
      integer(attempt.durationMs);
      if (!("observed" in attempt)) throw new Error("Missing observed value");
      if (array(attempt.evidence).some((id) => !evidenceIds.has(integer(id))))
        throw new Error("Missing evidence reference");
    }
  }
  const network = object(report.network);
  if (network.name !== null) text(network.name);
  if (network.genesisHash !== null && !/^0x[a-fA-F0-9]{64}$/.test(text(network.genesisHash)))
    throw new Error("Invalid genesis hash");
  if (network.specVersion !== null) integer(network.specVersion);
  text(network.reason);
  if (array(network.evidence).some((id) => !evidenceIds.has(integer(id)))) throw new Error("Missing network evidence");
  const budget = object(report.budget);
  if (integer(budget.requests) > integer(budget.maxRequests)) throw new Error("Request budget exceeded");
  integer(budget.cacheTtlMs);
  text(budget.maxFlop);
  text(budget.spentFlop);
  return report as unknown as RunReport;
}

/** Only reproduced failures can become issue drafts. Record why private source is unavailable. @example renderBugDraft(report, "invalid-limit", { sha, measuredAt, source }) */
export function renderBugDraft(
  report: RunReport,
  id: string,
  upstream: {
    sha: string | null;
    measuredAt: string;
    source: string;
    unavailableReason?: string;
    tracker?: { sha: string; measuredAt: string };
  },
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
  if (upstream.sha === null ? !upstream.unavailableReason?.trim() : !/^[a-f0-9]{40}$/.test(upstream.sha))
    throw new Error("Provide a valid upstream SHA or an explicit unavailability reason");
  if (upstream.tracker && !/^[a-f0-9]{40}$/.test(upstream.tracker.sha)) throw new Error("Invalid tracker SHA");
  const ids = new Set(result.attempts.flatMap((attempt) => attempt.evidence));
  const evidence = report.evidence.filter((item) => {
    if (!ids.has(item.id)) return false;
    if (!result.claim.tool) return true;
    try {
      const request = object(JSON.parse(item.request.body ?? "{}"));
      return object(request.params).name === result.claim.tool;
    } catch {
      return false;
    }
  });
  return [
    "### Commit verified against",
    "",
    ...(upstream.tracker
      ? [
          upstream.tracker.sha,
          `This is the public flop-labs/network issue-form revision, checked at ${upstream.tracker.measuredAt}. It is not the MCP source or deployed service revision.`,
        ]
      : []),
    `Implementation source: ${upstream.sha ?? `Unavailable: ${cell(upstream.unavailableReason!)}`}`,
    `Checked at ${upstream.measuredAt} from ${upstream.source}. No deployed service revision is established.`,
    "Public tracker: https://github.com/flop-labs/network. Private source access is tracked in issue #80.",
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
        observed:
          JSON.stringify(attempt.observed).length > 4096
            ? { excerpt: JSON.stringify(attempt.observed).slice(0, 4096), truncated: true }
            : attempt.observed,
        reason: attempt.reason,
      }),
    ),
    "",
    "Exact recorded requests and response excerpts:",
    "",
    ...evidence.map((item) =>
      fence({
        ...item,
        response: item.response.slice(0, 1024),
        excerptTruncated: item.responseTruncated === true || item.response.length > 1024,
      }),
    ),
    "",
    "### Unknown",
    "",
    "The hosted service's deployed revision, full network identity and root cause are not established. Separate reads are not an atomic snapshot. This report checks the quoted contract, not consensus or inference correctness.",
    "",
  ].join("\n");
}
