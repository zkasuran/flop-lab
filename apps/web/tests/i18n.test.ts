// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { sections, toolsIn } from "../content/tools";
import { sectionNotes, docHeadings } from "../components/suite/catalogue";
import { sectionEvidence } from "../components/suite/evidence";
import { SectionView } from "../components/suite/section-view";
import { ChineseHome } from "../app/zh/home-view";
import { readClaimRun, readPromiseLedger, readSettlementTape } from "../lib/evidence";
import type { Snapshot } from "../lib/devnet";
import { languageMetadata, languagePair, translatedPaths } from "../app/zh/routes";
import { translationGaps } from "../app/zh/translations/types";
import { sectionCopy } from "../app/zh/translations/sections";
import { home } from "../app/zh/translations/home";
import { docs } from "../app/zh/translations/docs";
import { common } from "../app/zh/translations/common";
import { searchDocuments } from "../app/zh/docs/model";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/zh" }));

describe("typed page translations", () => {
  it("has a nonempty Chinese value for every English key", () => {
    for (const dictionary of [home, docs, common, ...Object.values(sectionCopy)]) {
      expect(translationGaps(dictionary)).toEqual([]);
    }
  });
  it("detects removed, empty and orphaned translations", () => {
    expect(translationGaps({ en: { a: "A", b: "B" }, zh: { a: " ", extra: "额外" } })).toEqual(["a", "b", "extra"]);
    expect(translationGaps({ en: { toString: "A" }, zh: {} })).toEqual(["toString"]);
    expect(translationGaps({ en: {}, zh: {} })).toEqual([]);
  });
  it("detects English registry drift and new tool keys", () => {
    for (const section of sections) {
      const dictionary = sectionCopy[section.id];
      if (!dictionary) {
        // The dedicated file for this existing section was denied by the harness.
        expect(section.id).toBe("identity");
        continue;
      }
      expect(dictionary.en.title).toBe(section.title);
      expect(dictionary.en.question).toBe(section.question);
      expect(dictionary.en.note).toBe(sectionNotes[section.id]);
      expect(
        Object.keys(dictionary.en)
          .filter((key) => !["title", "question", "note"].includes(key))
          .sort(),
      ).toEqual(
        toolsIn(section.id)
          .map((tool) => tool.slug)
          .sort(),
      );
      for (const tool of toolsIn(section.id)) expect(dictionary.en[tool.slug], tool.slug).toBe(tool.tagline);
      const evidence = sectionEvidence();
      for (const tool of toolsIn(section.id).filter((tool) => evidence[tool.slug])) {
        expect(dictionary.metrics?.[tool.slug]?.label.trim(), tool.slug).toBeTruthy();
        expect(dictionary.metrics?.[tool.slug]?.note.trim(), tool.slug).toBeTruthy();
      }
    }
  });
  it("keeps translated promise prose aligned with the original ledger", async () => {
    const ledger = await readPromiseLedger(readClaimRun());
    const en = home.en as Record<string, string>;
    for (const [index, row] of ledger.rows.entries()) {
      expect(en[`promise${index + 1}`]).toBe(row.promise);
      expect(en[`outside${index + 1}`]).toBe(row.outside);
    }
  });
});

describe("language routes", () => {
  it("round trips all supported pages with reciprocal alternates", () => {
    for (const path of translatedPaths) {
      const pair = languagePair(path)!;
      expect(languagePair(pair.zh)).toEqual(pair);
      expect(languageMetadata(path, "en").alternates).toEqual({
        canonical: pair.en,
        languages: { en: pair.en, "zh-Hans": pair.zh, "x-default": pair.en },
      });
      expect(languageMetadata(path, "zh").alternates?.canonical).toBe(pair.zh);
    }
  });
  it("does not invent translated tools or accept path lookalikes", () => {
    for (const path of [
      "",
      "/verify",
      "/zh/verify",
      "//evil.example",
      "/zhh",
      "/zh/sections/nope",
      "/docs<script>",
      "/zh/docs?x=1",
    ]) {
      expect(languagePair(path)).toBeNull();
      expect(languageMetadata(path, "zh")).toEqual({});
    }
  });
});

describe("same dated evidence", () => {
  it("preserves recorded metric values, times, sources and tool names across sections", () => {
    const evidence = sectionEvidence();
    for (const section of sections) {
      const english = renderToStaticMarkup(createElement(SectionView, { id: section.id, evidence }));
      const chinese = renderToStaticMarkup(createElement(SectionView, { id: section.id, evidence, locale: "zh" }));
      for (const tool of toolsIn(section.id)) {
        expect(chinese).toContain(tool.name);
        const metric = evidence[tool.slug];
        if (!metric) continue;
        for (const html of [english, chinese]) {
          expect(html).toContain(metric.value.toLocaleString("en-US"));
          expect(html).toContain(metric.measuredAt);
          expect(html).toContain(metric.source.replaceAll("&", "&amp;"));
          expect(html).toContain(metric.recording);
        }
      }
    }
  });
  it("keeps a measured zero distinct from missing home observations", async () => {
    const missing = {
      value: null,
      source: "https://mcp.flop.network/mcp",
      measuredAt: null,
      stale: true,
      error: "<script>error</script>",
    };
    const snapshot: Snapshot = {
      renderedAt: "2026-11-06T00:00:00Z",
      stats: { ...missing, value: { block: 0, accounts: 0 } },
      settlements: missing,
      miners: missing,
    };
    const html = renderToStaticMarkup(
      createElement(ChineseHome, {
        snapshot,
        run: null,
        tape: readSettlementTape(),
        ledger: await readPromiseLedger(null),
      }),
    );
    expect(html).toContain(home.zh.noData);
    expect(html).toContain(home.zh.sampleUnavailable);
    expect(html).toContain(home.zh.missingRun);
    expect(html).toContain(">0</span>");
    expect(html).not.toContain("<script>error</script>");
    expect(html).toContain("&lt;script&gt;error&lt;/script&gt;");
    expect(html).toContain("curl --fail https://api.flop.network/v1/models");
  });
});

describe("document index", () => {
  it("searches Chinese questions without changing README headings or destinations", async () => {
    const markdown = await readFile(new URL("../../../packages/verifier/README.md", import.meta.url), "utf8");
    const entries = docHeadings(
      markdown,
      "Settlement verifier",
      "https://github.com/zkasuran/flop-lab/blob/main/packages/verifier/README.md",
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(searchDocuments(entries, "结算")).toEqual(entries);
    expect(searchDocuments(entries, "   ")).toEqual(entries);
    expect(searchDocuments(entries, "<script>")).toEqual([]);
    expect(searchDocuments([], "结算")).toEqual([]);
    expect(
      searchDocuments(entries, "What this does not verify").some((entry) =>
        entry.href.endsWith("#what-this-does-not-verify"),
      ),
    ).toBe(true);
  });
});
