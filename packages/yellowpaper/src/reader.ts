// SPDX-License-Identifier: Apache-2.0
import Slugger from "github-slugger";
import { Marked, type Token, type Tokens } from "marked";
import { parseYellowpaper, type Report } from "@flop-lab/spec";
import type { GlossaryTerm, Heading, OpenItem, Reader, SearchEntry } from "./model";

/** Normalize display punctuation without changing the recorded source. @example displayText("Pinned paper") */
export function displayText(text: string): string {
  return text.replace(/[\u2013\u2014]/g, "-");
}

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plain(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2")
    .replace(/&amp;/g, "&");
}

/** Build safe full-document HTML and a small client search index from a pinned paper. @example buildReader(recordedPaper(), recordedReport()) */
export function buildReader(paper: { raw: string; sha: string; measuredAt: string }, report?: Report): Reader {
  const spec = parseYellowpaper(paper.raw, paper.sha, paper.measuredAt);
  if (report && report.sha !== paper.sha) throw new Error("Comparison belongs to a different paper pin");
  const source = `https://github.com/flop-labs/yellowpaper/blob/${paper.sha}/yellowpaper.md`;
  const base = `https://github.com/flop-labs/yellowpaper/blob/${paper.sha}/`;
  const markdown = new Marked({ gfm: true, async: false });
  const tokens = markdown.lexer(paper.raw);
  const slugger = new Slugger();
  const headings: Heading[] = [];
  const glossary: GlossaryTerm[] = [];
  const openItems: OpenItem[] = [];
  const headingTokens = new Map<Token, Heading>();
  const glossaryCells = new Map<Tokens.TableCell, string>();
  const itemTokens = new Map<Token, string>();
  const references = new Map<string, string>();
  const anchors = new Set<string>();
  let line = 1;
  let section = "";
  for (const token of tokens) {
    if (token.type === "heading") {
      const title = plain(token.text);
      const id = slugger.slug(title);
      const reference =
        title.match(/^(\d+(?:\.\d+)*|[A-Z]\.\d+)\b/)?.[1] ?? title.match(/^Appendix ([A-Z])\b/)?.[1] ?? null;
      const heading = { id, title: displayText(title), depth: token.depth, line, reference };
      headings.push(heading);
      headingTokens.set(token, heading);
      anchors.add(id);
      if (reference && !references.has(reference)) references.set(reference, id);
      if (token.depth === 2) section = reference ?? "";
    }
    if (token.type === "table" && section === "1") {
      for (const row of token.rows) {
        const first = row[0];
        if (!first || row.length < 2) continue;
        const term = displayText(plain(first.text));
        const id = `glossary-${slugger.slug(term)}`;
        glossary.push({
          id,
          term,
          definition: displayText(
            plain(
              row
                .slice(1)
                .map((cell: Tokens.TableCell) => cell.text)
                .join(" | "),
            ),
          ),
          section: headings.at(-1)!.id,
        });
        anchors.add(id);
        glossaryCells.set(first, id);
      }
    }
    if (token.type === "paragraph" && section === "E") {
      const match = token.raw.match(/^\*\*(E\.\d+)\s+[\u2013\u2014-]\s+([\s\S]*?)\*\*/);
      if (match) {
        const id = match[1]!;
        const text = displayText(plain(token.raw));
        const publicReferences = [...new Set([...token.raw.matchAll(/yellowpaper#(\d+)\b/g)].map((m) => Number(m[1])))];
        const internalReferences = [
          ...new Set([...token.raw.matchAll(/(?<![\w/])#(\d+)\b/g)].map((m) => Number(m[1]))),
        ];
        openItems.push({
          id,
          title: displayText(plain(match[2]!)),
          status: match[2]!.match(/\[([^\]]+)\]/)?.[1] ?? "UNSPECIFIED",
          text,
          line,
          internalReferences,
          publicReferences,
        });
        anchors.add(`open-${id.toLowerCase()}`);
        references.set(id, `open-${id.toLowerCase()}`);
        itemTokens.set(token, `open-${id.toLowerCase()}`);
      }
    }
    line += (token.raw.match(/\n/g) ?? []).length;
  }
  for (const match of paper.raw.matchAll(/<a id="(param-[a-z0-9_]+)"><\/a>/g)) anchors.add(match[1]!);
  const unresolved = new Set<string>();
  function href(value: string): string | null {
    if ([...value].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127) || value.startsWith("//"))
      return null;
    if (value.startsWith("#")) {
      let id: string;
      try {
        id = decodeURIComponent(value.slice(1));
      } catch {
        return null;
      }
      if (anchors.has(id)) return `#${id}`;
      unresolved.add(value);
      return `${source}${value}`;
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
      } catch {
        return null;
      }
    }
    if (value.startsWith("/")) return null;
    const url = new URL(value, base);
    return url.href.startsWith(base) ? url.href : null;
  }
  let inLabel = false;
  function linkRefs(value: string): string {
    const pattern = /§\s*(\d+(?:\.\d+)*[a-z]?)|\bAppendix ([A-Z](?:\.\d+)?)\b|\b(E\.\d+)\b|\byellowpaper#(\d+)\b/g;
    let output = "";
    let offset = 0;
    for (const match of value.matchAll(pattern)) {
      output += escape(displayText(value.slice(offset, match.index)));
      const ref = match[1] ?? match[2] ?? match[3];
      const target = match[4]
        ? `https://github.com/flop-labs/yellowpaper/issues/${match[4]}`
        : ref
          ? references.get(ref)
          : undefined;
      output += target
        ? `<a href="${escape(match[4] ? target : `#${target}`)}">${escape(match[0])}</a>`
        : escape(match[0]);
      offset = match.index + match[0].length;
    }
    return output + escape(displayText(value.slice(offset)));
  }
  markdown.use({
    renderer: {
      heading(token) {
        const heading = headingTokens.get(token);
        if (!heading) return `<p>${escape(plain(token.text))}</p>`;
        inLabel = true;
        const label = this.parser.parseInline(token.tokens);
        inLabel = false;
        return `<h${Math.max(2, token.depth)} id="${escape(heading.id)}">${label}</h${Math.max(2, token.depth)}>\n`;
      },
      html(token) {
        // Source HTML cannot create active elements or attributes. Only known parameter anchors and inert typography survive.
        if (/^<!--/.test(token.text.trim())) return "";
        const anchor = token.text.match(/^<a id="(param-[a-z0-9_]+)">$/);
        if (anchor) return `<span id="${anchor[1]}"></span>`;
        if (token.text === "</a>") return "";
        if (/^<\/?(?:sub|sup|br)>$/.test(token.text)) return token.text;
        return escape(displayText(token.text.replace(/<[^>]*>/g, "")));
      },
      link(token) {
        const previous = inLabel;
        inLabel = true;
        const label = this.parser.parseInline(token.tokens);
        inLabel = previous;
        const target = href(token.href);
        return target ? `<a href="${escape(target)}">${label}</a>` : label;
      },
      image(token) {
        return escape(displayText(token.text));
      },
      text(token) {
        if ("tokens" in token && token.tokens) return this.parser.parseInline(token.tokens);
        return inLabel ? escape(displayText(token.text)) : linkRefs(token.text);
      },
      codespan(token) {
        return `<code>${escape(displayText(token.text))}</code>`;
      },
      code(token) {
        return `<pre><code>${escape(displayText(token.text))}</code></pre>\n`;
      },
      paragraph(token) {
        const id = itemTokens.get(token);
        return `<p${id ? ` id="${id}"` : ""}>${this.parser.parseInline(token.tokens)}</p>\n`;
      },
      tablecell(token) {
        const id = glossaryCells.get(token);
        const tag = token.header ? "th" : "td";
        return `<${tag}${token.header ? ' scope="col"' : ""}>${id ? `<span id="${id}"></span>` : ""}${this.parser.parseInline(token.tokens)}</${tag}>`;
      },
      table(token) {
        const head = token.header.map((cell) => this.tablecell(cell)).join("");
        const rows = token.rows.map((row) => `<tr>${row.map((cell) => this.tablecell(cell)).join("")}</tr>`).join("");
        return `<div class="paper-table" tabindex="0" role="region" aria-label="Specification table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      },
    },
  });
  const html = markdown.parser(tokens);
  const parameters =
    report?.differences.filter((difference) => difference.appendix === "A" && difference.spec !== null) ?? [];
  const search: SearchEntry[] = [
    ...headings.map((heading) => ({
      id: heading.id,
      title: heading.title,
      kind: "heading" as const,
      detail: `Line ${heading.line}`,
    })),
    ...glossary.map((term) => ({ id: term.id, title: term.term, kind: "glossary" as const, detail: term.definition })),
    ...spec.items
      .filter((item) => item.appendix === "A")
      .map((item) => ({
        id: item.enforced ? `param-${item.name}` : references.get("A")!,
        title: displayText(item.name),
        kind: "parameter" as const,
        detail: displayText(`${item.value} ${item.unit}`),
      })),
    ...openItems.map((item) => ({
      id: `open-${item.id.toLowerCase()}`,
      title: `${item.id} ${item.title}`,
      kind: "open-item" as const,
      detail: item.status,
    })),
  ];
  return {
    sha: paper.sha,
    measuredAt: paper.measuredAt,
    source,
    bytes: new TextEncoder().encode(paper.raw).length,
    headings,
    glossary,
    openItems,
    parameters,
    search,
    html,
    unresolvedLinks: [...unresolved],
    warnings: report?.warnings ?? spec.warnings,
  };
}
