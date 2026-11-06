// SPDX-License-Identifier: Apache-2.0
export const repositories = ["network", "yellowpaper", "tclk", "technocore-chat"] as const;
export type Repository = (typeof repositories)[number];
export const areas = ["access", "gateway", "sdk", "cli", "docs", "protocol", "erratum", "other"] as const;
export type Area = (typeof areas)[number];
export const types = ["request", "bug", "feature", "question", "docs", "erratum", "other"] as const;
export type ItemType = (typeof types)[number];
export type Comment = { created_at: string; author_association: string; isAuthor: boolean; isBot: boolean };
export type Item = {
  number: number;
  state: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  comments: number;
  pull_request: boolean;
  prefix: string;
  labels: string[];
  responses: Comment[];
  commentsComplete: boolean;
  commentsMeasuredAt: string | null;
};
export type RepoSample = {
  repo: Repository;
  source: string;
  measuredAt: string;
  status: number | null;
  hasMore: boolean;
  error: string | null;
  items: Item[];
};
export type ChatSample = {
  source: string;
  measuredAt: string;
  status: number | null;
  rooms: number | null;
  messages: number | null;
  raw: string | null;
  error: string | null;
};
export type Snapshot = {
  version: 1;
  startedAt: string;
  measuredAt: string;
  requests: number;
  sampleLimit: number;
  repos: RepoSample[];
  chat: ChatSample[];
};
export type Row = Item & {
  repo: Repository;
  source: string;
  measuredAt: string;
  area: Area;
  type: ItemType;
  ageHours: number;
  responseHours: number | null;
  responseState: "observed" | "none observed" | "unknown";
  closeHours: number | null;
};

/** Reject non-object boundary data. @example object(JSON.parse(text)) */
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected object");
  return value as Record<string, unknown>;
}
/** Validate an exact UTC timestamp. @example timestamp("2026-11-06T00:00:00Z") */
export function timestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error("Invalid timestamp");
  if (new Date(value).toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z"))
    throw new Error("Invalid calendar date");
  return value;
}
/** Validate a nonnegative count. @example count(0) */
export function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid count");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length > 1000) throw new Error("Invalid text");
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid boolean");
  return value;
}
function list(value: unknown, max = 100): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid list");
  return value;
}
const recognized = new Set<string>([...areas, ...types, "enhancement", "documentation", "access-request"]);
function token(value: string): string {
  return value.toLowerCase().replace(/^(?:area|type|component)[:/]\s*/, "");
}
function safeLabels(value: unknown): string[] {
  return list(value)
    .map((v) => (typeof v === "string" ? v : text(object(v).name)))
    .map(token)
    .filter((v) => recognized.has(v));
}

/** Keep classification inputs and dates only. Never retain title, body or user identity. @example projectIssue(rawIssue) */
export function projectIssue(value: unknown): Item {
  const v = object(value);
  const title = text(v.title);
  const prefixMatch = /^(?:\[([a-z-]+)\]\s*:?|([a-z-]+)(?:\(([a-z-]+)\))?\s*:)/i.exec(title);
  const prefix = (prefixMatch?.[3] ?? prefixMatch?.[1] ?? prefixMatch?.[2] ?? "").toLowerCase();
  const state = text(v.state);
  if (state !== "open" && state !== "closed") throw new Error("Invalid issue state");
  const created = timestamp(v.created_at),
    closed = v.closed_at === null ? null : timestamp(v.closed_at);
  if (closed && Date.parse(closed) < Date.parse(created)) throw new Error("Closure precedes creation");
  if ((state === "open") !== (closed === null)) throw new Error("Inconsistent closure");
  const number = count(v.number);
  if (!number) throw new Error("Invalid issue number");
  return {
    number,
    state,
    created_at: created,
    closed_at: closed,
    comments: count(v.comments),
    pull_request: v.pull_request !== undefined,
    prefix: recognized.has(prefix) ? prefix : "",
    labels: safeLabels(v.labels),
    responses: [],
    commentsComplete: v.comments === 0,
    commentsMeasuredAt: null,
  };
}

/** Discard comment text and logins before persistence. @example projectComments(rawComments, issueAuthorId) */
export function projectComments(value: unknown, authorId: number | null): Comment[] {
  return list(value).map((entry) => {
    const v = object(entry),
      user = v.user === null ? null : object(v.user);
    const association = text(v.author_association);
    if (
      ![
        "OWNER",
        "MEMBER",
        "COLLABORATOR",
        "CONTRIBUTOR",
        "FIRST_TIMER",
        "FIRST_TIME_CONTRIBUTOR",
        "NONE",
        "MANNEQUIN",
      ].includes(association)
    )
      throw new Error("Unknown association");
    return {
      created_at: timestamp(v.created_at),
      author_association: association,
      isAuthor: authorId === null || user === null || count(user.id) === authorId,
      isBot: user === null || text(user.type) !== "User",
    };
  });
}

/** Labels take priority over a recognized title prefix. @example classify({labels:["bug"],prefix:"sdk"}) */
export function classify(item: Pick<Item, "labels" | "prefix">): { area: Area; type: ItemType } {
  const labels = item.labels.map(token);
  const area =
    areas.find((a) => labels.includes(a)) ?? (areas.includes(item.prefix as Area) ? (item.prefix as Area) : "other");
  const type =
    types.find((t) => labels.includes(t)) ??
    (labels.includes("enhancement")
      ? "feature"
      : labels.includes("documentation")
        ? "docs"
        : area === "access"
          ? "request"
          : area === "erratum"
            ? "erratum"
            : types.includes(item.prefix as ItemType)
              ? (item.prefix as ItemType)
              : "other");
  return { area, type };
}

/** Derive elapsed times without treating missing responses as zero. @example rows(snapshot) */
export function rows(snapshot: Snapshot): Row[] {
  return snapshot.repos.flatMap((repo) =>
    repo.items.map((item) => {
      const created = Date.parse(item.created_at),
        observed = Date.parse(repo.measuredAt);
      const response = item.responses
        .filter(
          (c) =>
            ["OWNER", "MEMBER", "COLLABORATOR"].includes(c.author_association) &&
            !c.isAuthor &&
            !c.isBot &&
            Date.parse(c.created_at) >= created &&
            Date.parse(c.created_at) <= Date.parse(item.commentsMeasuredAt ?? repo.measuredAt),
        )
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
      return {
        ...item,
        ...classify(item),
        repo: repo.repo,
        source: `https://github.com/flop-labs/${repo.repo}/${item.pull_request ? "pull" : "issues"}/${item.number}`,
        measuredAt: repo.measuredAt,
        ageHours: (observed - created) / 3_600_000,
        responseHours: response ? (Date.parse(response.created_at) - created) / 3_600_000 : null,
        responseState: response
          ? ("observed" as const)
          : item.commentsComplete
            ? ("none observed" as const)
            : ("unknown" as const),
        closeHours: item.closed_at ? (Date.parse(item.closed_at) - created) / 3_600_000 : null,
      };
    }),
  );
}

/** Compute a median over observed durations only. @example median([2, 4]) === 3 */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Runtime validation for a saved privacy projection. Rejects added free-text fields. @example parseSnapshot(JSON.parse(text)) */
export function parseSnapshot(value: unknown): Snapshot {
  const v = object(value);
  if (v.version !== 1 || v.sampleLimit !== 25) throw new Error("Unsupported snapshot");
  const repos = list(v.repos, 4).map((entry): RepoSample => {
    const r = object(entry),
      repo = text(r.repo) as Repository;
    if (
      !repositories.includes(repo) ||
      r.source !==
        `https://api.github.com/repos/flop-labs/${repo}/issues?state=all&sort=created&direction=desc&per_page=25`
    )
      throw new Error("Invalid repository source");
    const measuredAt = timestamp(r.measuredAt);
    const items = list(r.items, 25).map((entry): Item => {
      const item = object(entry);
      const prefix = text(item.prefix),
        labels = safeLabels(item.labels);
      if (prefix !== "" && !recognized.has(prefix)) throw new Error("Invalid prefix");
      const parsed = projectIssue({
        ...item,
        title: prefix ? `${prefix}:` : "",
        labels,
        pull_request: bool(item.pull_request) ? {} : undefined,
      });
      if (
        Date.parse(parsed.created_at) > Date.parse(measuredAt) ||
        (parsed.closed_at && Date.parse(parsed.closed_at) > Date.parse(measuredAt))
      )
        throw new Error("Future issue date");
      const responses = list(item.responses).map((entry): Comment => {
        const c = object(entry);
        const parsed = projectComments(
          [{ created_at: c.created_at, author_association: c.author_association, user: { id: 1, type: "User" } }],
          2,
        )[0]!;
        return { ...parsed, isAuthor: bool(c.isAuthor), isBot: bool(c.isBot) };
      });
      const commentsMeasuredAt = item.commentsMeasuredAt === null ? null : timestamp(item.commentsMeasuredAt);
      if (responses.length && !commentsMeasuredAt) throw new Error("Missing comment observation date");
      if (
        responses.some(
          (c) =>
            Date.parse(c.created_at) < Date.parse(parsed.created_at) ||
            Date.parse(c.created_at) > Date.parse(commentsMeasuredAt!),
        )
      )
        throw new Error("Invalid comment chronology");
      return { ...parsed, responses, commentsMeasuredAt, commentsComplete: bool(item.commentsComplete) };
    });
    if (new Set(items.map((i) => i.number)).size !== items.length) throw new Error("Duplicate issue");
    return {
      repo,
      source: text(r.source),
      measuredAt,
      status: r.status === null ? null : count(r.status),
      hasMore: bool(r.hasMore),
      error: r.error === null ? null : text(r.error),
      items,
    };
  });
  if (new Set(repos.map((r) => r.repo)).size !== repos.length) throw new Error("Duplicate repository");
  const chat = list(v.chat, 2).map((entry): ChatSample => {
    const c = object(entry);
    if (!["https://technocore.chat/stats", "https://technocore.chat/rooms"].includes(text(c.source)))
      throw new Error("Invalid chat source");
    return {
      source: text(c.source),
      measuredAt: timestamp(c.measuredAt),
      status: c.status === null ? null : count(c.status),
      rooms: c.rooms === null ? null : count(c.rooms),
      messages: c.messages === null ? null : count(c.messages),
      raw: c.raw === null ? null : text(c.raw),
      error: c.error === null ? null : text(c.error),
    };
  });
  const result: Snapshot = {
    version: 1,
    startedAt: timestamp(v.startedAt),
    measuredAt: timestamp(v.measuredAt),
    requests: count(v.requests),
    sampleLimit: 25,
    repos,
    chat,
  };
  if (JSON.stringify(value) !== JSON.stringify(result)) {
    // Object key order is irrelevant. Comparing sorted trees rejects extra personal fields.
    const canonical = (x: unknown): string =>
      JSON.stringify(x, (_key, val: unknown) =>
        typeof val === "object" && val !== null && !Array.isArray(val)
          ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
          : val,
      );
    if (canonical(value) !== canonical(result)) throw new Error("Snapshot contains unsupported fields");
  }
  return result;
}
