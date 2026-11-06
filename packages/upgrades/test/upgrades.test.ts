// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { snapshotPath } from "../../recorder/src/schema";
import {
  capture,
  createReader,
  diffSpec,
  docsHistory,
  filterEvents,
  mergeTimeline,
  npmHistory,
  parameters,
  parseCommits,
  pythonHistory,
  recordedCapture,
  recordedReport,
  recording,
  runtimeHistory,
  sections,
  time,
  type Recording,
  type Revision,
} from "../src/index";

const at = "2026-11-05T00:00:00.000Z";
const raw = (body: unknown, source = "https://registry.npmjs.org/@flop-labs/sdk"): Recording => ({
  body: typeof body === "string" ? body : JSON.stringify(body),
  source,
  measuredAt: at,
  status: 200,
  lastModified: null,
});
const paper = (rows: string) =>
  `## Appendix A. Parameters\n### A.1 Values\n| Parameter | Value | Section |\n| --- | --- | --- |\n${rows}`;
function revision(body: string, later = false): Revision {
  const commit = {
    sha: (later ? "b" : "a").repeat(40),
    at: later ? "2026-11-06T00:00:00Z" : at,
    title: "Fixture revision",
  };
  return {
    commit,
    files: {
      "yellowpaper.md": raw(
        body,
        `https://raw.githubusercontent.com/flop-labs/yellowpaper/${commit.sha}/yellowpaper.md`,
      ),
    },
  };
}
function index(versions: (number | null)[], options: { reset?: boolean; genesis?: boolean } = {}) {
  return {
    version: 1,
    entries: versions.map((value, i) => {
      const id = String(i + 1).repeat(64),
        measuredAt = `2026-11-0${i + 1}T00:00:00.000Z`;
      return {
        id,
        measuredAt,
        path: snapshotPath({ id, startedAt: measuredAt }),
        claims: [],
        fields: {
          "health.runtimeVersion.specVersion": { value, measuredAt, source: "https://mcp.flop.network/mcp" },
          ...(options.genesis === false
            ? {}
            : {
                "indexer.block.hash": {
                  value: `0x${options.reset && i > 0 ? "b".repeat(64) : "a".repeat(64)}`,
                  measuredAt,
                  source: "https://mcp.flop.network/mcp",
                },
              }),
        },
      };
    }),
  };
}
const indexEvidence = { source: "https://github.com/zkasuran/flop-lab/tree/data", measuredAt: at };

describe("recorded public history", () => {
  it("finds exact changed parameters without inventing runtime events", () => {
    const report = recordedReport();
    expect(report.events).toHaveLength(19);
    expect(report.events.filter((e) => e.kind === "spec")).toHaveLength(5);
    const changes = report.events.flatMap((e) => e.changes).filter((c) => c.name.startsWith("Parameter:"));
    expect(changes).toHaveLength(9);
    expect(changes).toContainEqual({
      name: "Parameter: tx_fee_burn_percent_live",
      before: "10 percent",
      after: "0 percent",
    });
    expect(changes).toContainEqual({
      name: "Parameter: emission_through_halving_eras",
      before: "11_920_608_000 FLOP",
      after: "11_920_607_904 FLOP",
    });
    expect(report.events.some((e) => e.kind === "runtime")).toBe(false);
    expect(report.gaps.map((g) => g.kind)).toEqual(["runtime"]);
    expect(report.events.filter((e) => e.kind === "docs").map((e) => e.at)).toEqual([
      "2026-11-03",
      "2026-10-30",
      "2026-10-26",
    ]);
    expect(report.events.find((e) => e.title === "flop-sdk 0.2.0")).toBeDefined();
  });
  it("retains raw source times and immutable pins for every spec response", () => {
    const data = recordedCapture();
    expect(data.raw).toHaveLength(20);
    for (const r of data.raw) expect(recording(r)).toEqual(r);
    for (const revision of data.revisions)
      for (const file of Object.values(revision.files)) expect(file.source).toContain(revision.commit.sha);
  });
});

describe("spec comparisons", () => {
  it("catches additions, removals and changed literal values", () => {
    const before = revision(paper("| keep | 0 | A |\n| gone | 2 | A |\n| edit | 10 percent | A |"));
    const after = revision(paper("| keep | 0 | A |\n| new | 3 | A |\n| edit | 0 percent | A |"), true);
    const changes = diffSpec(before, after)[0]!.changes.filter((c) => c.name.startsWith("Parameter:"));
    expect(changes).toEqual([
      { name: "Parameter: edit", before: "10 percent", after: "0 percent" },
      { name: "Parameter: gone", before: "2", after: null },
      { name: "Parameter: new", before: null, after: "3" },
    ]);
    expect(diffSpec(before, before)).toEqual([]);
  });
  it("does not compare units arithmetically or parse values outside Appendix A", () => {
    expect(parameters("## 14 Governance\n| Parameter | Value |\n| x | 1 |").size).toBe(0);
    expect(parameters(paper('| <a id="param-x"></a>x | `a|b` | A |')).get("x")).toBe("`a|b`");
    expect(() => parameters(paper("| x | 1 | A |\n| x | 2 | A |"))).toThrow("Duplicate");
  });
  it("keeps sections distinct and ignores headings in fenced examples", () => {
    const raw =
      "## 5 Architecture\n### 5.3 DA\nx\n### Rationale\none\n### 5.4 Memory\ny\n### Rationale\ntwo\n```md\n## 99 fake\n```";
    const parsed = sections(raw);
    expect([...parsed.keys()].some((key) => key === "99")).toBe(false);
    expect([...parsed.values()].filter((s) => s.title === "Rationale")).toHaveLength(2);
    expect(sections("").size).toBe(0);
    const fenced = "````md\n~~~\n## 99 fake\n```\n## Appendix A\n| Parameter | Value |\n| fake | 1 |\n````";
    expect(sections(fenced).has("99")).toBe(false);
    expect(parameters(fenced).size).toBe(0);
  });
  it("rejects incomplete, failed and reversed revisions", () => {
    const a = revision("## 14 Governance\na"),
      b = revision("## 14 Governance\nb", true);
    expect(() => diffSpec(b, a)).toThrow("newer");
    expect(() => diffSpec(a, { ...b, files: {} })).toThrow("Incomplete");
    b.files["yellowpaper.md"]!.status = 503;
    expect(() => diffSpec(a, b)).toThrow("unavailable");
    b.files["yellowpaper.md"]!.status = 404;
    expect(diffSpec(a, b)[0]!.changes[0]!.after).toBeNull();
    expect(() => parseCommits({ message: "rate limited" })).toThrow();
  });
});

describe("release clocks and validation", () => {
  it("uses publication dates, not object order, tags or semver ordering", () => {
    const r = npmHistory(
      raw({
        name: "@flop-labs/sdk",
        "dist-tags": { latest: "9.0.0" },
        versions: { "9.0.0": { version: "9.0.0" }, "1.0.0": { version: "1.0.0" } },
        time: { "9.0.0": "2026-01-01T00:00:00Z", "1.0.0": "2026-02-01T00:00:00Z" },
      }),
    );
    expect(mergeTimeline(r.events).map((e) => e.title)).toEqual(["@flop-labs/sdk 1.0.0", "@flop-labs/sdk 9.0.0"]);
    expect(npmHistory(raw({ name: "@flop-labs/sdk", versions: {}, time: {} })).gaps).toHaveLength(1);
    expect(() => npmHistory(raw({ name: "other", versions: {}, time: {} }))).toThrow();
  });
  it("uses the earliest Python artifact upload and preserves yanked status", () => {
    const report = pythonHistory(
      raw(
        {
          info: { name: "flop-sdk" },
          releases: {
            "0.2.0": [
              { upload_time_iso_8601: "2026-01-02T00:00:00.123456Z", yanked: true },
              { upload_time_iso_8601: "2026-01-01T00:00:00Z", yanked: true },
            ],
            "0.1.0": [],
          },
        },
        "https://pypi.org/pypi/flop-sdk/json",
      ),
    );
    expect(report.events[0]!.at).toBe("2026-01-01T00:00:00.000Z");
    expect(report.events[0]!.title).toContain("yanked");
    expect(report.gaps).toHaveLength(1);
  });
  it("keeps a labelled docs date at day precision and never substitutes fetch time", () => {
    const r = raw(
      '<p class="doc__updated">Last updated 2026-10-30</p>',
      "https://docs.flop.network/docs/sdk-references",
    );
    expect(docsHistory(r).events[0]).toMatchObject({ at: "2026-10-30", clock: "page-date" });
    expect(docsHistory({ ...r, body: "No update label" }).events).toEqual([]);
    expect(docsHistory({ ...r, body: "", lastModified: "Fri, 30 Oct 2026 05:00:00 GMT" }).events[0]!.clock).toBe(
      "last-modified",
    );
    expect(docsHistory({ ...r, body: r.body.repeat(2) }).gaps).toHaveLength(1);
    expect(() => time("2026-02-30T00:00:00Z")).toThrow();
    expect(() => recording({ ...r, source: "javascript:alert(1)" })).toThrow();
  });
});

describe("recorder version continuity", () => {
  it("distinguishes a baseline, a repeat and a changed observation", () => {
    const r = runtimeHistory(index([0, 0, 1]), indexEvidence);
    expect(r.events).toHaveLength(2);
    expect(r.events[0]!.changes[0]).toMatchObject({ before: null, after: "0" });
    expect(r.events[1]!.changes[0]).toMatchObject({ before: "0", after: "1" });
    expect(r.events[1]!.clock).toBe("observed");
  });
  it("does not bridge missing observations or different/unknown genesis", () => {
    for (const input of [index([1, null, 2]), index([1, 2], { reset: true }), index([1, 2], { genesis: false })]) {
      expect(runtimeHistory(input, indexEvidence).events.every((e) => e.changes[0]!.before === null)).toBe(true);
    }
    expect(runtimeHistory(index([]), indexEvidence).gaps[0]!.kind).toBe("runtime");
  });
  it("rejects hostile field values and unsorted recorder indexes", () => {
    const r = index([1, 2]);
    r.entries.reverse();
    expect(() => runtimeHistory(r, indexEvidence)).toThrow("chronological");
    expect(() => runtimeHistory(index([1.5]), indexEvidence)).toThrow("numeric");
  });
});

describe("bounded transport and selection", () => {
  it("caches successful responses and expires them after the explicit TTL", async () => {
    let now = Date.parse(at);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("{}"));
    fetch.mockImplementation(async () => new Response("{}"));
    const reader = createReader({
      fetch,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });
    const a = await reader.get("https://registry.npmjs.org/@flop-labs/sdk");
    expect(await reader.get(a.source)).toEqual(a);
    expect(reader.requests).toBe(1);
    now += 900_001;
    await reader.get(a.source);
    expect(reader.requests).toBe(2);
    await expect(reader.get("https://localhost/private")).rejects.toThrow("Unsupported");
  });
  it("backs off, stops retrying and enforces the request ceiling", async () => {
    const sleeps: number[] = [];
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => new Response("busy", { status: 503 }));
    const reader = createReader({
      fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      maxRequests: 3,
    });
    expect((await reader.get("https://pypi.org/pypi/flop-sdk/json")).status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleeps).toContain(1000);
    await expect(reader.get("https://pypi.org/pypi/flop-sdk/json")).rejects.toThrow("ceiling");
  });
  it("does not invent a complete history from an offline capture", async () => {
    const reader = createReader({
      fetch: async () => {
        throw new Error("offline");
      },
      sleep: async () => {},
    });
    const data = await capture({ reader });
    expect(data.revisions).toEqual([]);
    expect(data.gaps).toHaveLength(10);
    expect(data.requests).toBe(10);
  });
  it("filters exact event kinds and searches changed parameters without mutation", () => {
    const events = recordedReport().events;
    expect(filterEvents(events, "spec", "tx_fee_burn_percent_live")).toHaveLength(5);
    expect(filterEvents(events, "runtime")).toEqual([]);
    expect(filterEvents(events, "all", "no-match-at-all")).toEqual([]);
    expect(mergeTimeline(events, events)).toHaveLength(events.length);
    expect(() => mergeTimeline(events, [{ ...events[0]!, title: "Conflicting" }])).toThrow("Conflicting");
  });
});
