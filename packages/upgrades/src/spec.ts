// SPDX-License-Identifier: Apache-2.0
import { cells } from "../../spec/src/parser";
import { object, recording, sha, text, time, type Change, type Event, type Recording } from "./model";

export type Commit = { sha: string; at: string; title: string };
export type Revision = { commit: Commit; files: Record<string, Recording> };

/** Validate GitHub commit metadata. @example parseCommit(JSON.parse(response.body)) */
export function parseCommit(value: unknown): Commit {
  const row = object(value),
    commit = object(row.commit);
  return {
    sha: sha(row.sha),
    at: time(object(commit.committer).date),
    title: text(commit.message, 100_000).split("\n")[0]!,
  };
}
/** Read a bounded GitHub commit page. @example parseCommits(JSON.parse(raw)) */
export function parseCommits(value: unknown): Commit[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Invalid commit page");
  return value.map(parseCommit);
}

function fenceAfter(line: string, fence: string | null): string | null {
  const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
  if (!marker) return fence;
  if (fence === null) return marker[1]!;
  return marker[1]![0] === fence[0] && marker[1]!.length >= fence.length && !line.slice(marker[0].length).trim()
    ? null
    : fence;
}

/** Split Markdown by headings outside fences. Exact section text is preserved. @example sections(paper).get("14") */
export function sections(raw: string): Map<string, { title: string; body: string }> {
  if (raw.length > 2_000_000) throw new Error("Document too large");
  const result = new Map<string, { title: string; body: string }>();
  let key = "preamble",
    title = "Preamble",
    lines: string[] = [],
    fence: string | null = null;
  const parents: string[] = [];
  let numberedContext = "start";
  const flush = () => {
    if (lines.some((line) => line.trim())) {
      if (result.has(key)) throw new Error(`Duplicate section ${key}`);
      result.set(key, { title, body: lines.join("\n").trim() });
    }
  };
  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    fence = fenceAfter(line, fence);
    const heading = fence === null ? line.match(/^(#{1,4})\s+(.+)$/) : null;
    if (heading) {
      flush();
      title = heading[2]!;
      const level = heading[1]!.length;
      parents.length = level - 1;
      const numbered = title.match(/^(\d+(?:\.\d+)*|Appendix [A-Z]|[A-Z]\.\d+|D-\d+)\b/)?.[1];
      if (numbered) numberedContext = numbered;
      key = numbered ?? `${[...parents.filter(Boolean), title].join(" / ")} [after ${numberedContext}]`;
      parents[level - 1] = key;
      lines = [line];
    } else lines.push(line);
  }
  flush();
  return result;
}

/** Read only Appendix A Parameter/Value tables. Values remain literal. @example parameters(paper).get("min_stake") */
export function parameters(raw: string): Map<string, string> {
  if (raw.length > 2_000_000) throw new Error("Document too large");
  const result = new Map<string, string>();
  let appendix = false,
    table = false;
  let fence: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    fence = fenceAfter(line, fence);
    if (fence) continue;
    if (/^##\s/.test(line)) {
      appendix = /^##\s+Appendix A\b/.test(line);
      table = false;
    }
    if (/^###\s/.test(line)) table = false;
    if (!appendix) continue;
    const row = cells(line);
    if (row[0] === "Parameter") {
      table = row[1] === "Value";
      continue;
    }
    if (!table || !row.length || /^[-:]+$/.test(row[0] ?? "")) continue;
    if (!row[1]) throw new Error("Incomplete parameter row");
    const name = row[0]!.match(/id="param-([^"]+)"/)?.[1] ?? row[0]!;
    if (result.has(name)) throw new Error(`Duplicate parameter ${name}`);
    result.set(name, row[1]);
  }
  return result;
}
function changes(before: Map<string, string>, after: Map<string, string>): Change[] {
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((name) => {
    const a = before.get(name) ?? null,
      b = after.get(name) ?? null;
    return a === b ? [] : [{ name, before: a, after: b }];
  });
}

/** Compare dated immutable revisions by section and Appendix A value. @example diffSpec(before, after) */
export function diffSpec(before: Revision, after: Revision): Event[] {
  sha(before.commit.sha);
  sha(after.commit.sha);
  time(before.commit.at);
  time(after.commit.at);
  if (Date.parse(before.commit.at) > Date.parse(after.commit.at))
    throw new Error("From commit is newer than to commit");
  const events: Event[] = [];
  for (const path of [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].sort()) {
    if (!/^(yellowpaper\.md|CHANGELOG\.md|decisions\/[a-zA-Z0-9._-]+\.md)$/.test(path))
      throw new Error("Unsupported spec path");
    const a = before.files[path] ? recording(before.files[path]) : null;
    const b = after.files[path] ? recording(after.files[path]) : null;
    if (!a || !b) throw new Error("Incomplete revision: absence requires a recorded 404");
    if (
      a.source !== `https://raw.githubusercontent.com/flop-labs/yellowpaper/${before.commit.sha}/${path}` ||
      b.source !== `https://raw.githubusercontent.com/flop-labs/yellowpaper/${after.commit.sha}/${path}`
    )
      throw new Error("Revision source does not match its immutable pin");
    if ((a && a.status !== 200 && a.status !== 404) || (b && b.status !== 200 && b.status !== 404))
      throw new Error("Spec source unavailable");
    const aBody = a?.status === 200 ? a.body : "",
      bBody = b?.status === 200 ? b.body : "";
    const sectionChanges = changes(
      new Map([...sections(aBody)].map(([k, v]) => [k, v.body])),
      new Map([...sections(bBody)].map(([k, v]) => [k, v.body])),
    );
    const params = path === "yellowpaper.md" ? changes(parameters(aBody), parameters(bBody)) : [];
    if (!sectionChanges.length && !params.length) continue;
    const evidence = b ?? a!;
    events.push({
      id: `spec:${before.commit.sha}:${after.commit.sha}:${path}`,
      kind: "spec",
      at: after.commit.at,
      clock: "commit",
      source: evidence.source,
      measuredAt: evidence.measuredAt,
      title: `${path}: ${before.commit.sha.slice(0, 7)} to ${after.commit.sha.slice(0, 7)}`,
      detail: `${after.commit.title}. ${sectionChanges.length} changed sections. ${params.length} changed Appendix A values. Text changes are not deployed upgrades.`,
      changes: [
        ...params.map((p) => ({ ...p, name: `Parameter: ${p.name}` })),
        ...sectionChanges.map((s) => ({ ...s, name: `Section: ${s.name}` })),
      ],
      links: [
        { label: "Before", url: `https://github.com/flop-labs/yellowpaper/blob/${before.commit.sha}/${path}` },
        { label: "After", url: `https://github.com/flop-labs/yellowpaper/blob/${after.commit.sha}/${path}` },
        {
          label: "Git comparison",
          url: `https://github.com/flop-labs/yellowpaper/compare/${before.commit.sha}...${after.commit.sha}`,
        },
      ],
    });
  }
  return events;
}
