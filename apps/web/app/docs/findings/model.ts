// SPDX-License-Identifier: Apache-2.0
export const repositories = ["flop-labs/network", "flop-labs/yellowpaper"] as const;
export type Issue = {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED";
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};
export type Recording = { repository: string; measuredAt: string; source: string; limit: number; raw: string };
const date = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

/** Validate the exact GitHub CLI response before display. Example: parseRecording(recording).issues[0]?.state. */
export function parseRecording(value: unknown): Recording & { issues: Issue[] } {
  if (!value || typeof value !== "object") throw new Error("Missing issue recording");
  const row = value as Record<string, unknown>;
  if (
    !repositories.some((repo) => repo === row.repository) ||
    !date(row.measuredAt) ||
    typeof row.raw !== "string" ||
    row.raw.length > 200_000 ||
    row.limit !== 100 ||
    row.source !== `https://github.com/${row.repository}/issues?q=is%3Aissue+author%3Azkasuran`
  )
    throw new Error("Invalid issue source metadata");
  const parsed: unknown = JSON.parse(row.raw);
  if (!Array.isArray(parsed) || parsed.length >= row.limit)
    throw new Error("Issue list is invalid or truncated; increase the recording limit with review");
  const seen = new Set<number>();
  const issues: Issue[] = parsed.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid issue");
    const issue = item as Record<string, unknown>;
    if (
      typeof issue.number !== "number" ||
      !Number.isSafeInteger(issue.number) ||
      issue.number < 1 ||
      seen.has(issue.number) ||
      typeof issue.title !== "string" ||
      !issue.title.trim() ||
      issue.title.length > 1000 ||
      issue.url !== `https://github.com/${row.repository}/issues/${issue.number}` ||
      !["OPEN", "CLOSED"].includes(String(issue.state)) ||
      !date(issue.createdAt) ||
      !date(issue.updatedAt) ||
      !(issue.closedAt === null || date(issue.closedAt)) ||
      (issue.state === "CLOSED") !== (issue.closedAt !== null)
    )
      throw new Error("Invalid issue fields");
    seen.add(issue.number);
    return {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      state: issue.state as Issue["state"],
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      closedAt: issue.closedAt,
    } as Issue;
  });
  return {
    repository: row.repository as string,
    measuredAt: row.measuredAt,
    source: row.source as string,
    limit: row.limit,
    raw: row.raw,
    issues,
  };
}
