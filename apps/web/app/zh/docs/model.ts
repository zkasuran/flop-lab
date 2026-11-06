// SPDX-License-Identifier: Apache-2.0
import { tools } from "@/content/tools";
import { searchEntries, type SearchEntry } from "@/components/suite/catalogue";
import { sectionCopy } from "../translations/sections";

/** Search real headings using names and translated tool questions. Destinations stay unchanged. @example searchDocuments(entries, '结算') */
export function searchDocuments(entries: readonly SearchEntry[], query: string): SearchEntry[] {
  const docs = entries.filter((entry) => entry.kind === "Docs");
  const searchable = docs.map((entry) => {
    const tool = tools.find((tool) => entry.detail === `${tool.name} / README`);
    const translated = tool ? (sectionCopy[tool.section]?.zh[tool.slug] ?? "") : "";
    return { ...entry, detail: `${entry.detail} ${translated}` };
  });
  const ids = new Set(searchEntries(searchable, query).map((entry) => entry.id));
  return docs.filter((entry) => ids.has(entry.id));
}
