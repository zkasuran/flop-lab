// SPDX-License-Identifier: Apache-2.0
import { object, parseRecording, text } from "@flop-lab/spec";
import type { IssueCatalog, OpenItem, PublicIssue } from "./model";

/** Validate recorded public issue metadata. Reject a mismatched repository or issue URL. @example parseIssues(recordings) */
export function parseIssues(recordings: unknown[]): IssueCatalog {
  if (!recordings.length) throw new Error("No issue recording");
  const issues: PublicIssue[] = [];
  let measuredAt = "";
  for (const recording of recordings) {
    const record = parseRecording(recording);
    if (measuredAt && measuredAt !== record.measuredAt) throw new Error("Mixed issue recording times");
    measuredAt = record.measuredAt;
    for (const node of [JSON.parse(record.raw) as unknown]) {
      const row = object(node);
      const number = row.number;
      if (!Number.isSafeInteger(number) || (number as number) < 1) throw new Error("Invalid issue number");
      if (record.source !== `https://api.github.com/repos/flop-labs/yellowpaper/issues/${number}`)
        throw new Error("Unexpected issue source");
      if (row.state !== "open" && row.state !== "closed") throw new Error("Invalid issue state");
      if (row.html_url !== `https://github.com/flop-labs/yellowpaper/issues/${number}` || row.pull_request)
        throw new Error("Invalid issue URL");
      const updatedAt = text(row.updated_at);
      if (!Number.isFinite(Date.parse(updatedAt))) throw new Error("Invalid issue update time");
      if (issues.some((issue) => issue.number === number)) throw new Error("Duplicate issue");
      issues.push({
        number: number as number,
        title: text(row.title),
        state: row.state === "open" ? "OPEN" : "CLOSED",
        url: row.html_url as string,
        updatedAt,
      });
    }
  }
  return { measuredAt, source: "https://api.github.com/repos/flop-labs/yellowpaper/issues", issues };
}

/** Link explicit public citations and exact E.N title mentions, never bare internal tracker IDs. @example issuesFor(item, catalog) */
export function issuesFor(
  item: OpenItem,
  catalog: IssueCatalog,
): { issue: PublicIssue; relation: "cited" | "related" }[] {
  return catalog.issues.flatMap<{ issue: PublicIssue; relation: "cited" | "related" }>((issue) => {
    if (item.publicReferences.includes(issue.number)) return [{ issue, relation: "cited" as const }];
    const refs: string[] = issue.title.match(/\bE\.\d+\b/g) ?? [];
    return refs.includes(item.id) ? [{ issue, relation: "related" as const }] : [];
  });
}
