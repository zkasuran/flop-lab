// SPDX-License-Identifier: Apache-2.0
import captured from "./pull-request.json";
import { parsePullRequests, type PullRequest } from "../../lib/provenance";

export type Story = {
  measuredAt: string;
  source: string;
  pr: PullRequest;
  mergedAt: string;
  mergedBy: string;
  mergeCommit: string;
};

/** Read the dated public record without inferring a merge from closed status. Example: readStory(). */
export function readStory(input: unknown = captured): Story | null {
  try {
    if (!input || typeof input !== "object") return null;
    const record = input as Record<string, unknown>;
    if (
      typeof record.raw !== "string" ||
      record.raw.length > 200_000 ||
      typeof record.measuredAt !== "string" ||
      !Number.isFinite(Date.parse(record.measuredAt))
    )
      return null;
    const raw: unknown = JSON.parse(record.raw);
    const pr = parsePullRequests([raw])[0]!;
    const data = raw as Record<string, unknown>;
    const merger = data.merged_by as Record<string, unknown> | null;
    if (
      record.source !== `https://api.github.com/repos/zkasuran/flop-lab/pulls/${pr.number}` ||
      data.merged !== true ||
      pr.state !== "closed" ||
      typeof data.merged_at !== "string" ||
      !Number.isFinite(Date.parse(data.merged_at)) ||
      typeof data.merge_commit_sha !== "string" ||
      !/^[a-f0-9]{40}$/.test(data.merge_commit_sha) ||
      !merger ||
      typeof merger.login !== "string" ||
      !/^[a-zA-Z0-9-]{1,39}$/.test(merger.login)
    )
      return null;
    return {
      measuredAt: record.measuredAt,
      source: record.source,
      pr,
      mergedAt: data.merged_at,
      mergedBy: merger.login,
      mergeCommit: data.merge_commit_sha,
    };
  } catch {
    return null;
  }
}
