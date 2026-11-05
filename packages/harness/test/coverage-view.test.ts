// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import index from "../../../apps/web/app/harness/coverage-index.json";
import { coverageTotals, parseSourcePage } from "../../../apps/web/app/harness/coverage-model";
import { sourcePage } from "../../../apps/web/app/harness/source-data";
import { readRecording } from "../../../apps/web/app/harness/data";
import { loadInventory } from "../src/inventory-loader";
import { loadCoverageRecording } from "../src/recording";

it("uses the complete expanded recording on the page", async () => {
  expect(readRecording()).toEqual(await loadCoverageRecording());
});

it("keeps group counts in sync with quotes and counts mapped blocks separately from checks", async () => {
  const pages = await loadInventory();
  for (const summary of index) {
    const page = pages.find((page) => page.id === summary.id)!;
    expect(summary.blocks).toBe(page.units.length);
    expect(summary.mapped).toBe(page.units.filter((unit) => unit.checks.length).length);
    expect(sourcePage(summary.id)).toEqual(page);
    expect(parseSourcePage(sourcePage(summary.id), summary.id).id).toBe(summary.id);
  }
  const totals = coverageTotals(index, readRecording()!.results);
  expect(totals.blocks).toBeGreaterThan(totals.mapped);
  expect(totals.checks).toBeGreaterThan(totals.mapped);
  expect(totals.passed).toBeLessThan(totals.checks);
  expect(coverageTotals([], []).passed).toBe(0);
});

it("rejects crossed documents, unsafe links and malformed source units", () => {
  const page = sourcePage("protocol-parameters")!;
  expect(sourcePage("../protocol-parameters")).toBeNull();
  expect(() => parseSourcePage(page, "another-document")).toThrow("metadata");
  expect(() => parseSourcePage({ ...page, url: "javascript:alert(1)" }, page.id)).toThrow("metadata");
  expect(() => parseSourcePage({ ...page, units: [page.units[0], page.units[0]] }, page.id)).toThrow("unit");
  expect(() => parseSourcePage({ ...page, units: [{ ...page.units[0], line: 0 }] }, page.id)).toThrow("unit");
});
