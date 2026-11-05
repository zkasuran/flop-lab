// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { commands } from "../../../packages/cli/src/commands";
import { tools } from "../content/tools";
import { docHeadings, navigationEntries, searchEntries, sectionHref, toolCommand } from "../components/suite/catalogue";
import { sectionEvidence } from "../components/suite/evidence";
import { parseMetric } from "../components/suite/metric";

describe("suite search and routes", () => {
  it("separates section navigation from the verifier tool and keeps planned destinations external", () => {
    const results = searchEntries(navigationEntries(), "verify");
    expect(results.find((entry) => entry.kind === "Section")?.href).toBe("/sections/verify");
    expect(results.find((entry) => entry.id === "tool:verify")?.href).toBe("/verify");
    expect(sectionHref("identity")).toBe("/sections/identity");
    for (const tool of tools.filter((tool) => tool.status === "planned")) {
      expect(navigationEntries().find((entry) => entry.id === `tool:${tool.slug}`)?.href).toMatch(
        /^https:\/\/github.com\//,
      );
    }
  });
  it("requires every query word, handles whitespace and ranks exact titles first", () => {
    const entries = navigationEntries();
    expect(searchEntries(entries, "  BUDGET   policy ").map((entry) => entry.id)).toEqual(["tool:spendguard"]);
    expect(searchEntries(entries, "Verify")[0]?.id).toBe("section:verify");
    expect(searchEntries(entries, "<script>nothing</script>")).toEqual([]);
    expect(searchEntries([], "verify")).toEqual([]);
    expect(searchEntries(entries, " ")).toHaveLength(entries.length);
  });
  it("indexes actual README headings with duplicate anchors and excludes fenced sample headings", async () => {
    const source = "https://github.com/example/repo/blob/main/README.md";
    const headings = docHeadings(
      "## Run\n```sh\n# not a heading\n```\n## Run\n~~~md\n## hidden\n~~~\n### [Read](https://example.com) `bytes`! ###",
      "Guide",
      source,
    );
    expect(headings.map((heading) => heading.href)).toEqual([
      `${source}#run`,
      `${source}#run-1`,
      `${source}#read-bytes`,
    ]);
    const markdown = await readFile(new URL("../README.md", import.meta.url), "utf8");
    const docs = docHeadings(markdown, "Website guide", source);
    expect(searchEntries(docs, "contribution verification")[0]?.href).toBe(`${source}#contribution-verification`);
    expect(docHeadings("", "Empty", source)).toEqual([]);
  });
  it("uses actual umbrella subcommands and does not invent a Kestra CLI", () => {
    for (const tool of tools.filter((tool) => tool.status !== "planned")) {
      const command = toolCommand(tool);
      if (tool.slug === "kestra") expect(command).toBeNull();
      else expect(commands.some((entry) => command === `flop ${entry.name} --help`)).toBe(true);
    }
  });
});

describe("dated section evidence", () => {
  it("projects a sourced observation for every currently available tool", () => {
    const evidence = sectionEvidence();
    for (const tool of tools.filter((tool) => tool.status !== "planned")) {
      expect(evidence[tool.slug], tool.slug).not.toBeNull();
      expect(evidence[tool.slug]?.recording).toMatch(/^https:\/\/github.com\/zkasuran\/flop-lab\/blob\/main\//);
    }
    expect(evidence.harness?.value).toBe(61);
    expect(evidence.explorer?.value).toBe(2);
    expect(evidence.kestra?.value).toBe(100);
    expect(evidence.verify?.value).toBe(2945153);
    expect(evidence.spendguard?.value).toBe(1);
    expect(evidence.sdk?.value).toBe(9);
    expect(evidence.spec?.value).toBe(0);
    expect(evidence.spec?.measuredAt).toBe("2026-11-05T20:44:56.248Z");
  });
  it("retains a measured zero and rejects missing values rather than manufacturing zero", () => {
    const real = sectionEvidence().spec!;
    expect(parseMetric(real)?.value).toBe(0);
    for (const input of [
      null,
      [],
      {},
      { ...real, value: undefined },
      { ...real, value: "0" },
      { ...real, value: -1 },
      { ...real, value: Infinity },
      { ...real, value: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      expect(parseMetric(input)).toBeNull();
    }
  });
  it("rejects undated, unsafe and unsourced metric claims", () => {
    const real = sectionEvidence().spec!;
    for (const input of [
      { ...real, measuredAt: "" },
      { ...real, measuredAt: "yesterday" },
      { ...real, source: "javascript:alert(1)" },
      { ...real, source: "https://user:password@example.com" },
      { ...real, recording: "http://example.com" },
      { ...real, sourceLabel: "" },
    ]) {
      expect(parseMetric(input)).toBeNull();
    }
  });
});
