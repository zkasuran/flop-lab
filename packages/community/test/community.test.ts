// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accessForm, lintAccess } from "../src/access.js";
import { cacheTtlMs, collectCommunity, parseRooms } from "../src/collect.js";
import { classify, median, parseSnapshot, projectComments, projectIssue, rows, type Snapshot } from "../src/model.js";
import { recordedSnapshot } from "../src/recorded.js";
import form from "../fixtures/access-form.json" with { type: "json" };

const now = Date.parse("2026-11-06T00:00:00Z");
const issue = {
  number: 1,
  title: "access: private free text",
  body: "DO NOT PERSIST",
  user: { id: 7, login: "DO NOT PERSIST" },
  state: "open",
  created_at: "2026-11-01T00:00:00Z",
  closed_at: null,
  comments: 2,
  labels: [{ name: "status:triage" }, { name: "type:question" }],
};
function fixture(): Snapshot {
  return {
    version: 1,
    startedAt: new Date(now).toISOString(),
    measuredAt: new Date(now).toISOString(),
    requests: 0,
    sampleLimit: 25,
    repos: [
      {
        repo: "network",
        source:
          "https://api.github.com/repos/flop-labs/network/issues?state=all&sort=created&direction=desc&per_page=25",
        measuredAt: new Date(now).toISOString(),
        status: 200,
        hasMore: false,
        error: null,
        items: [projectIssue(issue)],
      },
    ],
    chat: [],
  };
}
const dirs: string[] = [];
async function dir() {
  const path = await mkdtemp(join(tmpdir(), "flop-community-"));
  dirs.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("dated projections", () => {
  it("replays the recorded sources and retains observed absence", () => {
    const s = recordedSnapshot();
    expect(s.repos.map((r) => r.repo)).toEqual(["network", "yellowpaper", "tclk", "technocore-chat"]);
    expect(s.chat.find((c) => c.source.endsWith("/stats"))).toMatchObject({ status: 404, messages: null });
    expect(s.chat.find((c) => c.source.endsWith("/rooms"))?.rooms).toBe(17238);
    expect(rows(s).find((r) => r.repo === "network" && r.number === 103)).toMatchObject({
      area: "access",
      state: "open",
      responseHours: null,
    });
    expect(rows(s).every((r) => r.ageHours >= 0)).toBe(true);
  });
  it("drops personal text, identities and arbitrary labels at ingress", () => {
    const projected = projectIssue(issue);
    expect(projected).toMatchObject({ prefix: "access", labels: ["question"] });
    expect(JSON.stringify(projected)).not.toContain("DO NOT PERSIST");
    expect(projected).not.toHaveProperty("user");
    expect(projected).not.toHaveProperty("body");
  });
  it.each([
    [
      { labels: ["area:sdk", "type:bug"], prefix: "docs" },
      { area: "sdk", type: "bug" },
    ],
    [
      { labels: [], prefix: "access" },
      { area: "access", type: "request" },
    ],
    [
      { labels: ["enhancement"], prefix: "gateway" },
      { area: "gateway", type: "feature" },
    ],
    [
      { labels: [], prefix: "erratum" },
      { area: "erratum", type: "erratum" },
    ],
    [
      { labels: [], prefix: "" },
      { area: "other", type: "other" },
    ],
  ])("classifies observed labels and prefix %#", (input, expected) => {
    expect(classify(input)).toEqual(expected);
  });
  it("distinguishes PRs and conventional title scopes", () => {
    expect(projectIssue({ ...issue, title: "fix(cli): do something", pull_request: {} })).toMatchObject({
      pull_request: true,
      prefix: "cli",
    });
  });
  it("measures only qualifying response and closure clocks", () => {
    const s = fixture(),
      i = s.repos[0]!.items[0]!;
    i.responses = projectComments(
      [
        { created_at: "2026-11-01T01:00:00Z", author_association: "OWNER", user: { id: 7, type: "User" } },
        { created_at: "2026-11-01T02:00:00Z", author_association: "MEMBER", user: { id: 8, type: "Bot" } },
        { created_at: "2026-11-01T03:00:00Z", author_association: "CONTRIBUTOR", user: { id: 8, type: "User" } },
        { created_at: "2026-11-01T04:00:00Z", author_association: "COLLABORATOR", user: { id: 8, type: "User" } },
      ],
      7,
    );
    i.commentsMeasuredAt = s.measuredAt;
    i.closed_at = "2026-11-03T00:00:00Z";
    i.state = "closed";
    expect(rows(s)[0]).toMatchObject({ responseHours: 4, closeHours: 48, ageHours: 120, responseState: "observed" });
  });
  it("keeps no response distinct from uncollected comments and true zero", () => {
    const s = fixture(),
      i = s.repos[0]!.items[0]!;
    expect(rows(s)[0]).toMatchObject({ responseHours: null, responseState: "unknown" });
    i.commentsComplete = true;
    expect(rows(s)[0]).toMatchObject({ responseHours: null, responseState: "none observed" });
    i.responses = [{ created_at: i.created_at, author_association: "OWNER", isAuthor: false, isBot: false }];
    i.commentsMeasuredAt = s.measuredAt;
    expect(rows(s)[0]?.responseHours).toBe(0);
    expect(median([])).toBeNull();
    expect(median([0, 2, 100, 4])).toBe(3);
  });
  it("orders response timestamps numerically when millisecond precision differs", () => {
    const s = fixture(),
      item = s.repos[0]!.items[0]!;
    item.commentsMeasuredAt = s.measuredAt;
    item.responses = [
      { created_at: "2026-11-01T00:00:00.001Z", author_association: "MEMBER", isAuthor: false, isBot: false },
      { created_at: "2026-11-01T00:00:00Z", author_association: "OWNER", isAuthor: false, isBot: false },
    ];
    expect(rows(s)[0]?.responseHours).toBe(0);
  });
  it("fails closed on malformed counts, dates, duplicate rows and personal additions", () => {
    expect(() => projectIssue({ ...issue, comments: -1 })).toThrow();
    expect(() => projectIssue({ ...issue, created_at: "2026-02-30T00:00:00Z" })).toThrow();
    expect(() => projectIssue({ ...issue, state: "closed", closed_at: null })).toThrow();
    expect(() => parseSnapshot({ ...fixture(), author: "unwanted" })).toThrow();
    const s = fixture();
    s.repos[0]!.items.push(s.repos[0]!.items[0]!);
    expect(() => parseSnapshot(s)).toThrow("Duplicate");
    const future = fixture();
    future.repos[0]!.items[0]!.created_at = "2027-01-01T00:00:00Z";
    expect(() => parseSnapshot(future)).toThrow("Future");
  });
  it("handles empty source data without invented observations", () => {
    expect(rows({ ...fixture(), repos: [] })).toEqual([]);
  });
});

describe("local access form", () => {
  it("pins all required fields to the actual recorded form", () => {
    expect(form.source).toContain("9a59aca2ef3e013ea4862522074f8d0752bb43b9");
    for (const field of accessForm.fields) {
      const part = form.raw.split(`label: ${field.label}`)[1]!.split("  - type:")[0]!;
      expect(part).toContain("required: true");
      for (const option of field.options) expect(part).toContain(`- ${option}`);
    }
    expect(form.raw.split("label: Details")[1]).toContain("required: false");
  });
  it("returns names only and accepts optional details missing", () => {
    const result = lintAccess(
      "### Request\ngateway allowance\n### Network\ndevnet\n### Public identifiers\nexample.invalid",
    );
    expect(result.valid).toBe(true);
    expect(JSON.stringify(result)).not.toContain("example.invalid");
  });
  it("finds missing, placeholder, duplicate and invalid option fields", () => {
    expect(lintAccess("").findings).toHaveLength(3);
    expect(
      lintAccess("### Request\n_No response_\n### Network\nmainnet\n### Public identifiers\n<!-- hidden -->").findings,
    ).toHaveLength(3);
    expect(lintAccess("### Network\ndevnet\n### Network\ntestnet").findings).toContainEqual({
      field: "Network",
      problem: "Duplicate field",
    });
    expect(() => lintAccess("a".repeat(65537))).toThrow();
  });
});

describe("bounded collectors", () => {
  const emptyFetch = vi.fn<typeof fetch>(async (url) =>
    String(url).includes("technocore.chat/") ? new Response("unavailable", { status: 404 }) : new Response("[]"),
  );
  it("caches successful empty sources and failures across collector instances", async () => {
    const cacheDir = await dir();
    emptyFetch.mockClear();
    const first = await collectCommunity({ cacheDir, fetch: emptyFetch, now: () => now, sleep: async () => {} });
    expect(first.requests).toBe(6);
    expect(first.snapshot.chat[0]?.messages).toBeNull();
    const repeat = await collectCommunity({ cacheDir, fetch: emptyFetch, now: () => now + 1, sleep: async () => {} });
    expect(repeat).toMatchObject({ cached: true, requests: 0 });
    expect(emptyFetch).toHaveBeenCalledTimes(6);
  });
  it("reserves chat requests before sending and enforces a rolling day", async () => {
    const cacheDir = await dir();
    await writeFile(
      join(cacheDir, "chat-budget.json"),
      JSON.stringify(Array(19).fill(new Date(now - 1000).toISOString())),
    );
    emptyFetch.mockClear();
    const result = await collectCommunity({ cacheDir, fetch: emptyFetch, now: () => now, sleep: async () => {} });
    expect(result.requests).toBe(5);
    expect(result.snapshot.chat[1]?.error).toContain("budget exhausted");
    expect(JSON.parse(await readFile(join(cacheDir, "chat-budget.json"), "utf8"))).toHaveLength(20);
  });
  it("refreshes after six hours and fails closed on concurrent or corrupt state", async () => {
    const cacheDir = await dir();
    await collectCommunity({ cacheDir, fetch: emptyFetch, now: () => now, sleep: async () => {} });
    expect(
      (await collectCommunity({ cacheDir, fetch: emptyFetch, now: () => now + cacheTtlMs, sleep: async () => {} }))
        .cached,
    ).toBe(false);
    await mkdir(join(cacheDir, "lock"));
    await expect(collectCommunity({ cacheDir, fetch: emptyFetch })).rejects.toThrow("locked");
    const bad = await dir();
    await writeFile(join(bad, "chat-budget.json"), "{}");
    await expect(collectCommunity({ cacheDir: bad, fetch: emptyFetch })).rejects.toThrow("budget");
  });
  it("backs off once for GitHub errors without retrying chat", async () => {
    const sleeper = vi.fn(async () => {}),
      counts = new Map<string, number>();
    const fetcher: typeof fetch = async (url) => {
      const key = String(url),
        n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return key.includes("technocore.chat/") || n === 1
        ? new Response(null, { status: 503, headers: { "retry-after": "2" } })
        : new Response("[]");
    };
    const result = await collectCommunity({ cacheDir: await dir(), fetch: fetcher, now: () => now, sleep: sleeper });
    expect(result.requests).toBe(10);
    expect(sleeper).toHaveBeenCalledWith(2000);
    expect(counts.get("https://technocore.chat/stats")).toBe(1);
  });
  it("bounds busy comment threads without losing repository coverage", async () => {
    const fetcher: typeof fetch = async (url) => {
      const key = String(url);
      if (key.includes("technocore.chat/")) return new Response(null, { status: 404 });
      if (key.includes("/comments?")) return new Response("[]");
      return new Response(JSON.stringify(Array.from({ length: 25 }, (_, i) => ({ ...issue, number: i + 1 }))));
    };
    const result = await collectCommunity({
      cacheDir: await dir(),
      fetch: fetcher,
      now: () => now,
      sleep: async () => {},
    });
    expect(result.snapshot.repos.every((r) => r.items.length === 25)).toBe(true);
    expect(result.requests).toBe(46);
    expect(result.snapshot.repos[0]!.items[24]!.commentsComplete).toBe(false);
    expect(JSON.stringify(result)).not.toContain("DO NOT PERSIST");
  });
  it("parses room totals without summing sequence numbers or trusting names", () => {
    const raw = recordedSnapshot().chat.find((c) => c.source.endsWith("/rooms"))!.raw!;
    expect(parseRooms(`${raw}\n/r/untrusted seq 999999999`)).toEqual({ rooms: 17238, raw });
    expect(() => parseRooms("# 50 of 2 rooms (cap 100, 1M of 2M stored), newest first")).toThrow();
    expect(() => parseRooms("<html>Error</html>")).toThrow();
  });
});
