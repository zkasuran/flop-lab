// SPDX-License-Identifier: Apache-2.0
import type { SearchEntry } from "./model";

/** Search literal words across names and heading text. Empty queries show the index. @example searchIndex(entries, "dispute window") */
export function searchIndex(entries: readonly SearchEntry[], query: string, limit = 30): SearchEntry[] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid search limit");
  const words = query.trim().toLocaleLowerCase("en-US").slice(0, 200).split(/\s+/).filter(Boolean);
  const normalize = (value: string) => value.toLocaleLowerCase("en-US").replaceAll("_", " ");
  return entries
    .filter((entry) => words.every((word) => normalize(`${entry.title} ${entry.detail}`).includes(normalize(word))))
    .sort((a, b) => {
      const rank = (entry: SearchEntry) =>
        words.every((word) => normalize(entry.title).includes(normalize(word))) ? 0 : 1;
      return rank(a) - rank(b);
    })
    .slice(0, limit);
}
