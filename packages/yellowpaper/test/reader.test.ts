// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { recordedReport } from "@flop-lab/spec";
import {
  buildReader,
  issuesFor,
  parseIssues,
  recordedIssues,
  recordedPaper,
  recordedReader,
  searchIndex,
} from "../src/index";
import issueRecordings from "../fixtures/issues.json";

const reader = recordedReader();
const paper = recordedPaper();

describe("pinned reader", () => {
  it("indexes the full recorded document and every navigable target", () => {
    expect(reader.bytes).toBe(377134);
    expect(reader.headings).toHaveLength(119);
    expect(reader.glossary).toHaveLength(101);
    expect(reader.openItems).toHaveLength(32);
    expect(reader.parameters).toHaveLength(182);
    expect(reader.unresolvedLinks).toEqual([]);
    const ids = [...reader.html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of reader.search) expect(ids, entry.title).toContain(entry.id);
    for (const link of reader.html.matchAll(/href="#([^"]+)"/g)) expect(ids).toContain(link[1]);
    expect(reader.html).toContain('href="#35-tier-3--independent-optimistic-re-execution--slashing"');
    expect(reader.html).toContain(`/blob/${reader.sha}/decisions/v0.4.md`);
  });

  it("keeps precise line provenance and fenced heading text", () => {
    const lines = paper.raw.split("\n");
    for (const heading of reader.headings) expect(lines[heading.line - 1]).toMatch(/^#{2,}/);
    const custom = buildReader({
      ...paper,
      raw: "## 1. One\n\n```md\n## Fake\n```\n\n## 2. Two\n\n### Again\n### Again\n",
    });
    expect(custom.headings.map((h) => h.id)).toEqual(["1-one", "2-two", "again", "again-1"]);
    expect(custom.html).toContain("## Fake");
  });

  it("gives every scrollable table a distinct name tied to its section", () => {
    const labels = [...reader.html.matchAll(/class="paper-table"[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
    expect(labels.length).toBeGreaterThan(1);
    expect(new Set(labels).size).toBe(labels.length);
    const custom = buildReader({
      ...paper,
      raw: "## 1. Units\n\n| Unit | Value |\n| --- | --- |\n| FLOP | 1 |\n\n## 2. Bounds\n\n| Name | Limit |\n| --- | --- |\n| Rows | 2 |\n",
    });
    expect(custom.html).toContain('aria-label="1. Units table 1"');
    expect(custom.html).toContain('aria-label="2. Bounds table 2"');
  });

  it("uses the existing exact comparison and retains missing evidence", () => {
    const row = reader.parameters.find((p) => p.name === "channel_dispute_window_blocks")!;
    expect(row.result).toBe("MATCH");
    expect(row.spec?.value).toBe("604_800");
    expect(row.runtime?.evidence.source).toContain("flop_knowledge_get");
    const report = recordedReport();
    expect(() => buildReader(paper, { ...report, sha: "a".repeat(40) })).toThrow("different paper pin");
    expect(buildReader(paper).parameters).toEqual([]);
  });

  it("treats hostile source markup and links as inert content", () => {
    const raw =
      '## 1. Safe\n\n<script>alert(1)</script>\n\n<a href="javascript:alert(2)" onclick="evil()">bad</a>\n\n[x](javascript:alert%281%29) [y](data:text/html,evil) [z](//evil.test/x) [q](https://u:p@example.com)\n\n![x](https://beacon.test/x)\n\n`<img src=x onerror=evil()>`\n\n[a](#absent) <a id="param-ok"></a>`ok`\n';
    const result = buildReader({ ...paper, raw });
    expect(result.html).not.toMatch(/<(script|img)|onclick=|href="(?:javascript:|data:|\/\/)/);
    expect(result.html).toContain("&lt;img");
    expect(result.html).toContain('id="param-ok"');
    expect(result.unresolvedLinks).toEqual(["#absent"]);
    expect(result.html).toContain(`${reader.source}#absent`);
  });

  it("handles empty input and rejects invalid provenance or size", () => {
    expect(buildReader({ ...paper, raw: "" }).search).toEqual([]);
    expect(() => buildReader({ ...paper, sha: "main" })).toThrow();
    expect(() => buildReader({ ...paper, measuredAt: "yesterday" })).toThrow();
    expect(() => buildReader({ ...paper, raw: "x".repeat(2_000_001) })).toThrow();
  });
});

describe("search and public issue mapping", () => {
  it("finds headings, glossary terms and parameter names with literal all-word matching", () => {
    expect(
      searchIndex(reader.search, "dispute window").some((row) => row.title === "channel_dispute_window_blocks"),
    ).toBe(true);
    expect(searchIndex(reader.search, "validator").some((row) => row.kind === "glossary")).toBe(true);
    expect(searchIndex(reader.search, "§%&unlikely")).toEqual([]);
    expect(searchIndex(reader.search, "[.*]")).toEqual([]);
    expect(searchIndex(reader.search, "dispute impossible")).toEqual([]);
    expect(searchIndex([], "validator")).toEqual([]);
    expect(searchIndex(reader.search, "", 3)).toHaveLength(3);
    expect(() => searchIndex(reader.search, "", -1)).toThrow();
  });

  it("keeps internal tracker IDs distinct from cited and related public issues", () => {
    const catalog = recordedIssues();
    const checker = reader.openItems.find((item) => item.id === "E.53")!;
    expect(checker.publicReferences).toEqual([3, 13]);
    expect(checker.internalReferences).toContain(1553);
    expect(
      issuesFor(checker, catalog)
        .filter((link) => link.relation === "cited")
        .map((link) => link.issue.number),
    ).toEqual([3, 13]);
    const item = { ...checker, id: "E.4", publicReferences: [], internalReferences: [3] };
    expect(issuesFor(item, catalog)).toEqual([]);
    expect(
      issuesFor(
        reader.openItems.find((item) => item.id === "E.41")!,
        catalog,
      )[0]?.relation,
    ).toBe("related");
    expect(catalog.issues.every((issue) => issue.state === "OPEN")).toBe(true);
  });

  it("rejects malformed issue states, mismatched sources and duplicate issues", () => {
    const recording = issueRecordings[0]!;
    const row: Record<string, unknown> = JSON.parse(recording.raw);
    expect(() => parseIssues([])).toThrow();
    expect(() => parseIssues([recording, recording])).toThrow("Duplicate");
    for (const patch of [
      { state: "resolved" },
      { number: -1 },
      { html_url: "https://example.com/3" },
      { updated_at: "bad" },
      { pull_request: {} },
    ]) {
      expect(() => parseIssues([{ ...recording, raw: JSON.stringify({ ...row, ...patch }) }])).toThrow();
    }
    expect(() => parseIssues([{ ...recording, source: "https://example.com" }])).toThrow();
    expect(() => parseIssues([{ ...recording, raw: "null" }])).toThrow();
  });
});
