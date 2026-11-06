// SPDX-License-Identifier: Apache-2.0
import type { Command } from "./commands";

const stop = new Set(
  "a an and are as at be by can do does each flop for from has how i in is it its me my of on or own that the their them this to tool tools was what when where which who will with would".split(
    " ",
  ),
);

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export type SearchMatch = { command: Command; matched: readonly string[] };

/**
 * Search registry text with case-insensitive token prefixes. No network or inferred claims.
 * Example: searchCommands(commands, "miner reliability")[0]?.command.name === "score".
 */
export function searchCommands(list: readonly Command[], query: string): SearchMatch[] {
  const terms = [...new Set(words(query).filter((word) => !stop.has(word)))];
  if (!terms.length) return [];
  return list
    .map((command) => {
      const corpus = words(
        `${command.name} ${command.pkg} ${command.section} ${command.summary} ${command.tagline ?? ""}`,
      );
      return { command, matched: terms.filter((term) => corpus.some((word) => word.startsWith(term))) };
    })
    .filter((match) => match.matched.length > 0)
    .sort((a, b) => {
      const exact = (command: Command) => Number(command.name === query.trim().toLowerCase());
      return (
        exact(b.command) - exact(a.command) ||
        b.matched.length - a.matched.length ||
        a.command.name.localeCompare(b.command.name, "en")
      );
    });
}
