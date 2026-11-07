// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commands } from "../../../../../packages/cli/src/commands";
import { readCatalog } from "../catalog";
import { parseReadme, readmeHref, searchDocs } from "../model";
import { parseRecording } from "../findings/model";
import network from "../findings/network.json";
import yellowpaper from "../findings/yellowpaper.json";

describe("README-derived documentation", () => {
  it("includes every package README with exact raw bytes and its registered command", () => {
    const { docs } = readCatalog();
    const packages = readdirSync("packages", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(docs.map((doc) => doc.slug).sort()).toEqual(packages);
    for (const doc of docs) {
      const raw = readFileSync(`packages/${doc.slug}/README.md`, "utf8");
      expect(doc.raw).toBe(raw);
      expect(doc.sha256).toBe(createHash("sha256").update(raw).digest("hex"));
      expect(doc.headings.at(-1)?.title.toLowerCase()).toBe("what this does not verify");
      const command = commands.find((item) => item.pkg === doc.packageName);
      if (command) expect(doc.command).toBe(`flop ${command.name}`);
    }
  });
  it("keeps shell comments and indentation inside fences, not in the heading index", () => {
    expect(parseReadme("## Start\n\n```sh\n# not a heading\n  node app.js\n```\n\n## Start")).toEqual([
      { kind: "heading", depth: 2, id: "start", title: "Start" },
      { kind: "code", language: "sh", text: "# not a heading\n  node app.js" },
      { kind: "heading", depth: 2, id: "start-1", title: "Start" },
    ]);
    expect(parseReadme("~~~~\n```\n## inert\n~~~~")[0]).toMatchObject({ kind: "code", text: "```\n## inert" });
    expect(parseReadme("```\n<svg onload=alert(1)>")[0]).toMatchObject({ kind: "code", text: "<svg onload=alert(1)>" });
    expect(parseReadme("")).toEqual([]);
  });
  it("retains tables and ordered list starts", () => {
    expect(parseReadme("| Field | Meaning |\n| --- | --- |\n| a | b |\n\n3. First\n4. Next")).toEqual([
      { kind: "table", header: ["Field", "Meaning"], rows: [["a", "b"]] },
      { kind: "list", ordered: true, start: 3, items: ["First", "Next"] },
    ]);
  });
  it("resolves relative source links and rejects active schemes and credentials", () => {
    const source = "https://github.com/zkasuran/flop-lab/blob/main/packages/mcp/README.md";
    expect(readmeHref("src/index.ts", source)).toBe(
      "https://github.com/zkasuran/flop-lab/blob/main/packages/mcp/src/index.ts",
    );
    expect(readmeHref("../cli/README.md", source)).toContain("packages/cli/README.md");
    expect(readmeHref("#quick-start", source)).toBe("#quick-start");
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<svg>",
      "//example.com",
      "https://user:pass@example.com",
      "https:\\example.com",
      "java\nscript:alert(1)",
    ])
      expect(readmeHref(bad, source)).toBeUndefined();
  });
  it("requires every query word and the chosen section; empty results stay empty", () => {
    const docs = [
      {
        slug: "a",
        title: "Settlement",
        question: "Does escrow add up?",
        section: "verify",
        packageName: "a",
        command: "flop verify",
        headings: [{ title: "Arithmetic", id: "arithmetic", depth: 2 }],
      },
      {
        slug: "b",
        title: "Budget",
        question: "Who spends?",
        section: "agents",
        packageName: "b",
        command: "flop guard",
        headings: [],
      },
    ];
    expect(searchDocs(docs, " ESCROW arithmetic ")).toEqual([docs[0]]);
    expect(searchDocs(docs, "escrow nonexistent")).toEqual([]);
    expect(searchDocs(docs, "escrow", "agents")).toEqual([]);
    expect(searchDocs(docs, "[.*]")).toEqual([]);
    expect(searchDocs(docs, "")).toEqual(docs);
    expect(searchDocs([], "")).toEqual([]);
  });
});

describe("dated GitHub evidence", () => {
  it("validates both recorded real queries and preserves states and dates", () => {
    for (const recording of [network, yellowpaper]) {
      const parsed = parseRecording(recording);
      expect(parsed.issues).toEqual(JSON.parse(recording.raw));
      expect(parsed.measuredAt).toBe(recording.measuredAt);
    }
  });
  it("accepts a genuinely empty response but rejects unavailable, malformed and truncated records", () => {
    expect(parseRecording({ ...network, raw: "[]" }).issues).toEqual([]);
    for (const value of [
      null,
      {},
      { ...network, measuredAt: "yesterday" },
      { ...network, raw: "{}" },
      { ...network, raw: "invalid" },
      { ...network, raw: JSON.stringify(Array(100).fill(JSON.parse(network.raw)[0])) },
    ])
      expect(() => parseRecording(value)).toThrow();
  });
  it("rejects forged links, duplicate issues and inconsistent closure states", () => {
    const issue = JSON.parse(network.raw)[0] as Record<string, unknown>;
    for (const issues of [
      [{ ...issue, url: "https://example.com" }],
      [issue, issue],
      [{ ...issue, state: "CLOSED", closedAt: null }],
      [{ ...issue, state: "FIXED" }],
    ])
      expect(() => parseRecording({ ...network, raw: JSON.stringify(issues) })).toThrow();
  });
});
