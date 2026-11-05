// SPDX-License-Identifier: Apache-2.0
import type { InventoryPage } from "../../../../packages/harness/src/inventory";
import type { ClaimResult } from "./model";

export interface CoveragePage {
  id: string;
  title: string;
  url: string;
  measuredAt: string;
  format: string;
  firstLine: number;
  blocks: number;
  mapped: number;
  checks: string[];
}

/** Count source coverage separately from passing predicates. @example coverageTotals(pages, results) */
export function coverageTotals(pages: CoveragePage[], results: ClaimResult[]) {
  const ids = new Set(pages.flatMap((page) => page.checks));
  return {
    pages: pages.length,
    blocks: pages.reduce((sum, page) => sum + page.blocks, 0),
    mapped: pages.reduce((sum, page) => sum + page.mapped, 0),
    checks: ids.size,
    passed: results.filter((result) => ids.has(result.claim.id) && result.status === "PASS").length,
  };
}

/** Validate same-origin lazy source details before rendering. @example parseSourcePage(await response.json(), id) */
export function parseSourcePage(value: unknown, id: string): InventoryPage {
  if (!value || typeof value !== "object") throw new Error("Invalid source page");
  const page = value as Partial<InventoryPage>;
  if (
    page.id !== id ||
    !Array.isArray(page.units) ||
    page.units.length > 1000 ||
    typeof page.title !== "string" ||
    typeof page.url !== "string" ||
    !page.url.startsWith("https://") ||
    typeof page.measuredAt !== "string" ||
    !Number.isFinite(Date.parse(page.measuredAt))
  )
    throw new Error("Invalid source page metadata");
  const ids = new Set<string>();
  for (const unit of page.units) {
    if (
      !unit ||
      typeof unit.id !== "string" ||
      ids.has(unit.id) ||
      unit.document !== id ||
      typeof unit.quote !== "string" ||
      typeof unit.boundary !== "string" ||
      !Array.isArray(unit.checks) ||
      unit.checks.some((check) => typeof check !== "string" || !/^[a-z][a-z0-9-]+$/.test(check)) ||
      !Number.isSafeInteger(unit.line) ||
      unit.line < 1 ||
      !Number.isSafeInteger(unit.endLine) ||
      unit.endLine < unit.line
    )
      throw new Error("Invalid source unit");
    ids.add(unit.id);
  }
  return page as InventoryPage;
}
