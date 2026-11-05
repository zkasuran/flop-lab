// SPDX-License-Identifier: Apache-2.0
import { readFile, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractDocument, type SourceDocument } from "../src/extraction";
import { loadInventory, parseDocument } from "../src/inventory";
import { loadClaims } from "../src/catalogue";
const pages = await loadInventory();
const root = new URL("../fixtures/sources/", import.meta.url);
const seed: SourceDocument = {
  id: "test",
  title: "test",
  url: "https://docs.flop.network/docs/test",
  measuredAt: "2026-11-05T00:00:00.000Z",
  format: "html",
  firstLine: 1,
  raw: "",
};

describe("source completeness and provenance", () => {
  it("covers every URL in the recorded index and every paper line range", async () => {
    const index = JSON.parse(await readFile(new URL("index.json", root), "utf8")) as { raw: string };
    const urls = [...index.raw.matchAll(/\]\((https:\/\/docs\.flop\.network\/docs\/[a-z0-9-]+)\)/g)].map(
      (match) => match[1],
    );
    expect(
      pages
        .filter((page) => page.format === "html")
        .map((page) => page.url)
        .sort(),
    ).toEqual(urls.sort());
    let next = 1;
    for (const page of pages.filter((page) => page.format === "markdown")) {
      const doc = parseDocument(JSON.parse(await readFile(new URL(`${page.id}.json`, root), "utf8")));
      expect(doc.firstLine).toBe(next);
      next += doc.raw.split("\n").length;
    }
    expect(next).toBeGreaterThan(4000);
  });
  it("retains quotes, reasons and unambiguous links for all extracted blocks", async () => {
    const ids = new Set(pages.flatMap((page) => page.units.map((unit) => unit.id)));
    expect(ids.size).toBe(pages.reduce((sum, page) => sum + page.units.length, 0));
    expect(
      pages.every((page) =>
        page.units.every((unit) => unit.quote && unit.line > 0 && unit.endLine >= unit.line && unit.boundary),
      ),
    ).toBe(true);
    for (const claim of await loadClaims())
      if (
        claim.id.startsWith("docs-") ||
        claim.id.startsWith("paper-") ||
        claim.id === "hosted-session-boundary" ||
        claim.id === "offer-miner-selection"
      ) {
        const unit = pages.flatMap((page) => page.units).find((unit) => unit.id === claim.source.path);
        expect(unit?.quote).toBe(claim.source.quote);
        expect(unit?.checks).toContain(claim.id);
      }
    for (const page of pages) expect((await stat(new URL(`${page.id}.json`, root))).size).toBeLessThan(200_000);
  });
  it("keeps table cells, multiline source lines, entities and text without normative keywords", () => {
    const units = extractDocument({
      ...seed,
      raw: '<article class="doc__body">\n<h2>Terms</h2>\n<p>Plain &amp; precise.</p>\n<table><tr><th>Name</th><th>Value</th></tr><tr><td>Stake</td><td>10</td></tr></table>\n<pre>&lt;never execute&gt;</pre></article>',
    });
    expect(units.map((unit) => [unit.quote, unit.line])).toEqual([
      ["Plain & precise.", 3],
      ["Stake | 10", 4],
      ["<never execute>", 5],
    ]);
  });
  it("rejects changed renderer content rather than silently dropping claims", () => {
    expect(() =>
      extractDocument({ ...seed, raw: '<article class="doc__body"><aside>New claim</aside></article>' }),
    ).toThrow("Unparsed");
    expect(() => extractDocument({ ...seed, raw: "" })).toThrow("Missing");
  });
  it("keeps fenced headings as code and distinguishes non-normative prose", () => {
    const units = extractDocument({
      ...seed,
      format: "markdown",
      firstLine: 40,
      raw: "## Requirements\nMUST pay.\n\n```md\n## Fake heading\n```\n### Rationale (non-normative)\nExplanation.",
    });
    expect(units.map((unit) => [unit.kind, unit.normative])).toEqual([
      ["prose", true],
      ["code", true],
      ["prose", false],
    ]);
    expect(units[0]?.line).toBe(41);
  });
});
