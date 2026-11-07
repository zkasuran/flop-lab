// SPDX-License-Identifier: Apache-2.0
export type Heading = { title: string; id: string; depth: number };
export type Block =
  | ({ kind: "heading" } & Heading)
  | { kind: "code"; text: string; language: string }
  | { kind: "paragraph" | "quote"; text: string }
  | { kind: "list"; ordered: boolean; start: number; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "rule" };

/** Plain search labels retain words from Markdown. Example: plain("Use `flop`") === "Use flop". */
export function plain(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .trim();
}

/** Parse README blocks without executing embedded HTML. Example: parseReadme("# Help\n\nRun `flop`."). */
export function parseReadme(raw: string): Block[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  const ids = new Set<string>();
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
  const isTable = (index: number) =>
    lines[index]?.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[index + 1] ?? "");
  const starts = (index: number) =>
    /^(?:#{1,6}\s|\s{0,3}(?:`{3,}|~{3,})|\s*[-*+]\s|\s*\d+\.\s|>\s|---+$)/.test(lines[index] ?? "") || isTable(index);
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      const text: string[] = [];
      const end = new RegExp(`^\\s{0,3}${fence[1]![0]}{${fence[1]!.length},}\\s*$`);
      i++;
      while (i < lines.length && !end.test(lines[i]!)) text.push(lines[i++]!);
      if (i < lines.length) i++;
      blocks.push({ kind: "code", text: text.join("\n"), language: fence[2]!.trim() });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
    if (heading) {
      const title = plain(heading[2]!);
      const base =
        title
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s_-]/gu, "")
          .replace(/\s/g, "-") || "section";
      let id = base;
      for (let suffix = 1; ids.has(id); suffix++) id = `${base}-${suffix}`;
      ids.add(id);
      blocks.push({ kind: "heading", title, depth: heading[1]!.length, id });
      i++;
      continue;
    }
    if (isTable(i)) {
      const header = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim() && lines[i]!.includes("|")) rows.push(cells(lines[i++]!));
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    const list = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.*)$/);
    if (list) {
      const items: string[] = [];
      const ordered = Boolean(list[2]);
      while (i < lines.length) {
        const item = lines[i]!.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.*)$/);
        if (!item || Boolean(item[2]) !== ordered) break;
        let text = item[3]!;
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !starts(i)) text += `\n${lines[i++]!.trim()}`;
        items.push(text);
      }
      blocks.push({ kind: "list", ordered, start: Number(list[2] ?? 1), items });
      continue;
    }
    if (/^>/.test(line)) {
      const text: string[] = [];
      while (i < lines.length && /^>/.test(lines[i]!)) text.push(lines[i++]!.replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", text: text.join("\n") });
      continue;
    }
    const text = [line];
    i++;
    while (i < lines.length && lines[i]!.trim() && !starts(i)) text.push(lines[i++]!);
    blocks.push({ kind: "paragraph", text: text.join("\n") });
  }
  return blocks;
}

/** Resolve README links relative to the pinned source. Example: readmeHref("src/index.ts", source). */
export function readmeHref(value: string, source: string): string | undefined {
  if (
    [...value].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127) ||
    value.includes("\\") ||
    value.startsWith("//")
  )
    return undefined;
  if (value.startsWith("#")) return value;
  try {
    const url = new URL(value, source);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export type SearchDoc = {
  slug: string;
  title: string;
  question: string;
  section: string;
  packageName: string;
  command: string | null;
  headings: Heading[];
};

/** Match literal words across titles, questions and headings. Example: searchDocs(docs, "escrow arithmetic"). */
export function searchDocs<T extends SearchDoc>(docs: readonly T[], query: string, section = "all"): T[] {
  const terms = query.toLocaleLowerCase("en-US").trim().split(/\s+/).filter(Boolean);
  return docs.filter((doc) => {
    const haystack = [
      doc.title,
      doc.question,
      doc.packageName,
      doc.command ?? "",
      ...doc.headings.map((heading) => heading.title),
    ]
      .join(" ")
      .toLocaleLowerCase("en-US");
    return (section === "all" || doc.section === section) && terms.every((term) => haystack.includes(term));
  });
}
