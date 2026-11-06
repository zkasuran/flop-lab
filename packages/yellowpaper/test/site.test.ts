// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { readerPageData } from "../../../apps/web/app/yellowpaper/model";
import { recordedIssues, recordedReader } from "../src/recorded";

describe("reader page evidence boundary", () => {
  const reader = recordedReader();
  const catalog = recordedIssues();
  const data = readerPageData(reader, catalog);

  it("keeps the complete document and every search target in the server sections", () => {
    expect(data.sections.join("")).toBe(reader.html);
    expect(data.sections.length).toBeGreaterThan(1);
    for (const entry of data.summary.search) {
      expect(
        data.sections.some((section) => section.includes(`id="${entry.id}"`)),
        entry.title,
      ).toBe(true);
    }
    expect(data.summary.headingCount).toBe(119);
    expect(data.summary.glossaryCount).toBe(101);
  });

  it("retains quote provenance and explicit missing values without copying full source paragraphs to client metadata", () => {
    expect(data.summary).not.toHaveProperty("html");
    expect(data.summary).not.toHaveProperty("glossary");
    expect(data.summary).not.toHaveProperty("openItems");
    for (const row of data.summary.parameters) {
      const original = reader.parameters.find((parameter) => parameter.id === row.id)!;
      expect(row.runtime).toEqual(original.runtime);
      expect(row.result).toBe(original.result);
      expect(row.spec?.evidence.source).toBe(original.spec?.evidence.source);
      expect(row.spec?.evidence.measuredAt).toBe(original.spec?.evidence.measuredAt);
      expect(row.spec?.evidence).not.toHaveProperty("quote");
    }
    expect(data.summary.parameters.some((row) => row.runtime === null)).toBe(true);
    expect(data.summary.warnings).toEqual(reader.warnings);
  });

  it("keeps paper resolution distinct from dated public issue state and empty mappings", () => {
    const resolved = data.issues.find((item) => item.id === "E.41")!;
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.links[0]?.issue.state).toBe("OPEN");
    expect(data.issuesMeasuredAt).toBe(catalog.measuredAt);
    expect(readerPageData(reader, { ...catalog, issues: [] }).issues.every((item) => item.links.length === 0)).toBe(
      true,
    );
  });
});
