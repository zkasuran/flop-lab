// SPDX-License-Identifier: Apache-2.0
import { repository, sections, tools, toolHref, type Section, type Tool } from "../../content/tools";
import { commands } from "../../../../packages/cli/src/commands";

export const sectionNotes: Record<Section, string> = {
  observe:
    "Follow dated public observations and compare changes across recordings. Open a tool to see the source and the limits of its sample.",
  verify:
    "Compare a claim with evidence collected from outside the network. Inspect missing evidence as carefully as a passing check.",
  build:
    "Start with the public interfaces and examples you can replay. Trace a result to its documented contract before integrating it.",
  operate:
    "Compare a host with sourced operator requirements. Keep unknown checks visible before deciding what to run.",
  agents:
    "Inspect the evidence behind routing, budget limits and dispute review. Use the tools to explain a decision before an agent acts.",
  identity:
    "Follow the signatures attached to contributions and builds. Check which bytes a signature covers before trusting a claim.",
};

export type SearchEntry = {
  id: string;
  title: string;
  detail: string;
  href: string;
  kind: "Tool" | "Section" | "Docs";
};

/** Read registry routes without confusing tool and section names. @example sectionHref("verify") */
export function sectionHref(id: Section): string {
  return `/sections/${id}`;
}

/** Keep planned tools on their source destination. @example navigationEntries() */
export function navigationEntries(): SearchEntry[] {
  return [
    ...sections.map((section): SearchEntry => ({
      id: `section:${section.id}`,
      title: section.title,
      detail: section.question,
      href: sectionHref(section.id),
      kind: "Section",
    })),
    ...tools.map((tool): SearchEntry => ({
      id: `tool:${tool.slug}`,
      title: tool.name,
      detail: `${tool.slug} / ${tool.section} / ${tool.status} / ${tool.tagline}`,
      href: toolHref(tool),
      kind: "Tool",
    })),
  ];
}

/** Match all query words, with exact names before body matches. @example searchEntries(entries, "budget policy") */
export function searchEntries(entries: readonly SearchEntry[], query: string): SearchEntry[] {
  const words = query.trim().toLocaleLowerCase("en-US").split(/\s+/).filter(Boolean);
  const normalized = words.join(" ");
  const rank = (entry: SearchEntry) =>
    entry.title.toLowerCase() === normalized ? 0 : entry.title.toLowerCase().startsWith(normalized) ? 1 : 2;
  return entries
    .filter((entry) => words.every((word) => `${entry.title} ${entry.detail}`.toLowerCase().includes(word)))
    .sort((a, b) => rank(a) - rank(b));
}

/** Extract actual README headings with GitHub-style duplicate anchors. Fenced examples are excluded. @example docHeadings("## Run", "Guide", "https://github.com/org/repo") */
export function docHeadings(markdown: string, title: string, url: string): SearchEntry[] {
  const counts = new Map<string, number>();
  const result: SearchEntry[] = [];
  let fence: string | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      continue;
    }
    if (fence) continue;
    const match = /^#{1,6}\s+(.+?)(?:\s+#+)?$/.exec(line);
    if (!match) continue;
    const heading = match[1]!.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*`]/g, "");
    const base = heading
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_\-\s]/gu, "")
      .replace(/ /g, "-");
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    const anchor = `${base}${count ? `-${count}` : ""}`;
    result.push({
      id: `${url}#${anchor}`,
      title: heading,
      detail: `${title} / README`,
      href: `${url}#${anchor}`,
      kind: "Docs",
    });
  }
  return result;
}

/** Safe help command for shipped CLI tools. Kestra has no umbrella command. @example toolCommand(tool) */
export function toolCommand(tool: Tool): string | null {
  const command = commands.find((entry) => tool.repoPath === `packages/${entry.pkg.split("/").at(-1)}`);
  return command ? `flop ${command.name} --help` : null;
}

/** Source destination shared by headers and docs. @example toolSource(tool) */
export function toolSource(tool: Tool): string {
  return `${repository}/tree/main/${tool.repoPath}`;
}
