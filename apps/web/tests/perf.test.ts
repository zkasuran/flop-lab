// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import fixture from "../../../scripts/perf/fixtures/about.json";
import { buildJs, median, readMeasurement, sitemapRoutes, summarize } from "../../../scripts/perf/index";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("mobile performance budgets", () => {
  it("reads a recorded local production Lighthouse result with its source and time", () => {
    const result = readMeasurement(fixture.lhr, fixture.source);
    expect(result).toMatchObject({
      performance: 85,
      cls: 0,
      requests: 36,
      jsTransferBytes: 228925,
      measuredAt: "2026-11-06T06:15:55.453Z",
    });
  });

  it("takes independent medians rather than the best run or an average", () => {
    const sample = readMeasurement(fixture.lhr, fixture.source);
    const result = summarize([
      { ...sample, performance: 100, cls: 0.09 },
      { ...sample, performance: 89, cls: 0.01 },
      { ...sample, performance: 90, cls: 0.05 },
    ]);
    expect(result).toMatchObject({ performance: 90, cls: 0.05, pass: true });
    expect(summarize([90, 89.999, 80].map((performance) => ({ ...sample, performance })))).toMatchObject({
      performance: 89.999,
      pass: false,
    });
    expect(summarize([0, 0.050001, 0.1].map((cls) => ({ ...sample, performance: 100, cls })))).toMatchObject({
      cls: 0.050001,
      pass: false,
    });
  });

  it("refuses partial, missing, nonfinite and negative measurements", () => {
    for (const values of [[], [100], [90, 100], [90, 90, 90, 90], [90, NaN, 90], [90, Infinity, 90], [-1, 0, 0]]) {
      expect(() => median(values)).toThrow();
    }
    expect(median([0, 0, 0])).toBe(0);
  });

  it("rejects failed, redirected, desktop and malformed reports", () => {
    const mutations = [
      (lhr: typeof fixture.lhr) => {
        lhr.categories.performance.score = null as unknown as number;
      },
      (lhr: typeof fixture.lhr) => {
        lhr.categories.performance.score = 1.1;
      },
      (lhr: typeof fixture.lhr) => {
        lhr.configSettings.formFactor = "desktop";
      },
      (lhr: typeof fixture.lhr) => {
        lhr.fetchTime = "unknown";
      },
      (lhr: typeof fixture.lhr) => {
        lhr.finalDisplayedUrl = `${fixture.source}/404`;
      },
      (lhr: typeof fixture.lhr) => {
        lhr.audits["cumulative-layout-shift"].numericValue = NaN;
      },
      (lhr: typeof fixture.lhr) => {
        lhr.audits["network-requests"].details.items[0]!.statusCode = 404;
      },
    ];
    for (const mutate of mutations) {
      const lhr = structuredClone(fixture.lhr);
      mutate(lhr);
      expect(() => readMeasurement(lhr, fixture.source)).toThrow();
    }
    expect(() => readMeasurement({ ...fixture.lhr, runtimeError: { code: "NO_FCP" } }, fixture.source)).toThrow();
    for (const value of [null, {}, [], "", { categories: {} }])
      expect(() => readMeasurement(value, fixture.source)).toThrow();
  });
});

describe("sitemap coverage and emitted bytes", () => {
  const xml = (locations: string[]) =>
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.map((location) => `<url><loc>${location}</loc></url>`).join("")}</urlset>`;
  it("keeps every route once and ignores the production host when selecting local paths", () => {
    expect(sitemapRoutes(xml(["https://site.test/", "https://site.test/about", "https://site.test/about"]))).toEqual([
      "/",
      "/about",
    ]);
  });
  it("rejects empty, partial, foreign and non-page locations instead of passing no routes", () => {
    for (const value of [
      "",
      "<sitemapindex></sitemapindex>",
      xml([]),
      "<urlset><url></url></urlset>",
      xml(["file:///etc/passwd"]),
      xml(["https://a.test/", "https://b.test/"]),
      xml(["https://a.test/?q=1"]),
      xml(["https://a.test/#main"]),
      xml(["https://user:password@a.test/"]),
    ]) {
      expect(() => sitemapRoutes(value)).toThrow();
    }
  });
  it("sums unique initial chunks and refuses missing output and traversal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flop-perf-"));
    directories.push(directory);
    await mkdir(join(directory, "static"));
    await writeFile(join(directory, "static", "shared.js"), "shared");
    await writeFile(join(directory, "static", "page.js"), "page");
    const script = (path: string) => `<script src="${path}" async></script>`;
    expect(
      await buildJs(
        script("/_next/static/shared.js") + script("/_next/static/page.js") + script("/_next/static/shared.js"),
        directory,
      ),
    ).toMatchObject({ bytes: 10 });
    await expect(buildJs("<html></html>", directory)).rejects.toThrow("No initial Next JS");
    await expect(buildJs(script("/_next/static/missing.js"), directory)).rejects.toThrow();
    await expect(buildJs(script("/_next/static/../../outside.js"), directory)).rejects.toThrow("escaped");
    await expect(buildJs(script("https://example.test/script.js"), directory)).rejects.toThrow("Unexpected");
  });
});
