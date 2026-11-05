// SPDX-License-Identifier: Apache-2.0
export interface SourceDocument {
  id: string;
  title: string;
  url: string;
  measuredAt: string;
  format: "html" | "markdown";
  raw: string;
  firstLine: number;
}
export interface SourceUnit {
  id: string;
  document: string;
  section: string;
  line: number;
  endLine: number;
  quote: string;
  kind: "prose" | "table" | "code";
  normative: boolean;
}

function decode(raw: string): string {
  return raw.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? whole;
    const point = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
  });
}

function plain(raw: string): string {
  return decode(raw.replace(/<\/(?:td|th)>\s*<(?:td|th)[^>]*>/gi, " | ").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract every body block, not just keyword matches. Line numbers refer to the raw recording. @example extractDocument(recordedPage) */
export function extractDocument(doc: SourceDocument): SourceUnit[] {
  const units: SourceUnit[] = [];
  let section = doc.title;
  let normative = true;
  const add = (quote: string, kind: SourceUnit["kind"], line: number, endLine: number) => {
    if (quote)
      units.push({
        id: `${doc.id}-l${line}-${units.length + 1}`,
        document: doc.id,
        section,
        line,
        endLine,
        quote,
        kind,
        normative,
      });
  };
  if (doc.format === "html") {
    const start = doc.raw.indexOf('<article class="doc__body">');
    const end = doc.raw.indexOf("</article>", start);
    if (start < 0 || end < 0) throw new Error(`Missing docs article: ${doc.id}`);
    const article = doc.raw.slice(start, end);
    // This is the recorded docs renderer's block grammar. Unexpected visible content is rejected below.
    const blocks = /<(h[1-6]|p|li|tr|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    for (const match of article.matchAll(blocks)) {
      const tag = match[1]!;
      const content = match[2]!;
      const line = doc.firstLine + doc.raw.slice(0, start + match.index).split("\n").length - 1;
      const last = line + match[0].split("\n").length - 1;
      if (tag.startsWith("h")) section = plain(content);
      else if (tag === "tr" && /<th\b/i.test(content)) continue;
      else add(plain(content), tag === "pre" ? "code" : tag === "tr" ? "table" : "prose", line, last);
    }
    const remainder = plain(article.replace(blocks, "").replace(/<!--[\s\S]*?-->/g, ""));
    if (remainder) throw new Error(`Unparsed docs content in ${doc.id}: ${remainder.slice(0, 100)}`);
    return units;
  }
  let fence = "";
  let buffer: string[] = [];
  let first = doc.firstLine;
  const flush = () => {
    if (buffer.length) add(buffer.join("\n"), fence ? "code" : "prose", first, first + buffer.length - 1);
    buffer = [];
  };
  doc.raw.split("\n").forEach((line, index) => {
    const at = doc.firstLine + index;
    const heading = line.match(/^#{1,6}\s+(.+)/);
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (fence) {
        buffer.push(line);
        flush();
        fence = "";
      } else {
        flush();
        fence = marker[1]!;
        first = at;
        buffer.push(line);
      }
    } else if (fence) buffer.push(line);
    else if (heading) {
      flush();
      section = heading[1]!;
      normative = !/non-normative|informative|sources|open specification|reading guide/i.test(section);
    } else if (!line.trim()) flush();
    else if (/^\s*\|/.test(line)) {
      flush();
      if (!/^\s*\|[\s|:-]+$/.test(line)) add(line, "table", at, at);
    } else {
      if (/^\s*(?:[-*+] |\d+\. )/.test(line)) flush();
      if (!buffer.length) first = at;
      buffer.push(line);
    }
  });
  flush();
  return units;
}
