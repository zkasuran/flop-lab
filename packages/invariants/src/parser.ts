// SPDX-License-Identifier: Apache-2.0
import type { Quote, Rule, Source } from "./types";

const plain = (text: string) => text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*`]/g, "");

/** Validate a pinned source slice before parsing. @example parseSource(JSON.parse(text)) */
export function parseSource(value: unknown): Source {
  if (!value || typeof value !== "object") throw new Error("Expected source object");
  const o = value as Record<string, unknown>;
  if (
    typeof o.url !== "string" ||
    !/^https:\/\/github\.com\/flop-labs\/yellowpaper\/blob\/[a-f0-9]{40}\/yellowpaper\.md$/.test(o.url) ||
    typeof o.measuredAt !== "string" ||
    !Number.isFinite(Date.parse(o.measuredAt)) ||
    !Number.isSafeInteger(o.firstLine) ||
    Number(o.firstLine) < 1 ||
    typeof o.raw !== "string" ||
    o.raw.length === 0 ||
    o.raw.length > 196_608
  )
    throw new Error("Invalid pinned source, time, line or body");
  return { url: o.url, measuredAt: o.measuredAt, firstLine: Number(o.firstLine), raw: o.raw };
}

/** Parse every normative row and rule in sections 11 and 13, retaining exact quotes.
 * @example parseSections([securitySlice, failureSlice]).map(rule => rule.id)
 */
export function parseSections(values: unknown[]): Rule[] {
  const rules: Rule[] = [];
  for (const value of values) {
    const source = parseSource(value);
    const lines = source.raw.split("\n");
    if (!/^## (11|13)\. /.test(lines[0] ?? "")) throw new Error("Expected section 11 or 13");
    let section = "";
    let actor = "Protocol";
    let columns: string[] = [];
    let penalty = 0;
    const quote = (start: number, end: number): Quote => ({
      source: source.url,
      measuredAt: source.measuredAt,
      line: source.firstLine + start,
      endLine: source.firstLine + end,
      text: lines.slice(start, end + 1).join("\n"),
    });
    const add = (rule: Omit<Rule, "flags">) => {
      const text = rule.quote.text;
      const flags: Rule["flags"] = [];
      for (const flag of ["GAP", "OOS", "ASSUMED"] as const) if (text.includes(`[${flag}]`)) flags.push(flag);
      if (text.includes("removed") && rule.id === "fail_task") flags.push("REMOVED");
      rules.push({ ...rule, flags });
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.startsWith("### Rationale")) break;
      if (line.startsWith("### ")) {
        section = plain(line.slice(4));
        actor =
          section.startsWith("13.") && !section.startsWith("13.0")
            ? section.replace(/^13\.\d+ /, "").replace(/ \(.*/, "")
            : "Protocol";
        columns = [];
      }
      if (line.startsWith("|")) {
        // Escaped pipes belong to a cell, not to the table structure.
        const cells = line
          .slice(1, line.lastIndexOf("|"))
          .split(/(?<!\\)\|/)
          .map((s) => s.trim());
        if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
        if (!columns.length) {
          columns = cells;
          continue;
        }
        if (cells.length !== columns.length) throw new Error(`Malformed table at line ${source.firstLine + i}`);
        const first = plain(cells[0]!);
        const id = section.startsWith("11.1")
          ? first.split(" / ")[0]!.replace(" authority", "")
          : section.startsWith("11.3")
            ? `S11-${++penalty}`
            : first;
        add({
          id,
          title: plain(cells[section.startsWith("13.") ? 1 : 0]!),
          section,
          actor,
          kind: section.startsWith("11.3")
            ? "penalty"
            : section.startsWith("11.")
              ? "invariant"
              : section.startsWith("13.0")
                ? "policy"
                : "failure",
          quote: quote(i, i),
          cells: cells.map((text, index) => ({ column: columns[index]!, quote: text })),
        });
      } else if (/^(?:- )?\*\*R(?:11\.2[a-b]?|13\.0)\.\*\*/.test(line)) {
        const start = i;
        while (i + 1 < lines.length && lines[i + 1]!.trim() && !/^(?:- |\||###)/.test(lines[i + 1]!)) i++;
        const id = line.match(/R\d+\.\d+[a-z]?/)![0];
        add({
          id,
          title:
            id === "R13.0"
              ? "Missing evidence cannot become payout"
              : id === "R11.2"
                ? "Session work plausibility gate"
                : id === "R11.2a"
                  ? "Verified turns and transcript arithmetic"
                  : "Payment cannot issue public work credit",
          section,
          actor,
          kind: id.startsWith("R13") ? "policy" : "invariant",
          quote: quote(start, i),
          cells: [],
        });
      }
    }
  }
  if (!rules.length || new Set(rules.map((r) => r.id)).size !== rules.length)
    throw new Error("Empty or duplicate rule catalogue");
  return rules;
}
