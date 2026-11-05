// SPDX-License-Identifier: Apache-2.0
import { object, parseRecording, text, type Evidence, type Item, type SpecModel } from "./model";

/** Split Markdown table cells, preserving escaped pipes and pipes inside code. @example cells('| `x` | 1 |') */
export function cells(line: string): string[] {
  if (!line.trim().startsWith("|")) return [];
  const parts: string[] = [];
  let cell = "";
  let ticks = 0;
  for (let i = line.indexOf("|") + 1; i < line.length; i++) {
    const char = line[i]!;
    if (char === "\\" && line[i + 1] === "|") {
      cell += "|";
      i++;
      continue;
    }
    if (char === "`") ticks ^= 1;
    if (char === "|" && !ticks) {
      parts.push(cell.trim());
      cell = "";
    } else cell += char;
  }
  if (cell.trim()) parts.push(cell.trim());
  return parts;
}

/** Parse scalar display text without evaluating expressions. @example splitValue("604_800 blocks") */
export function splitValue(value: string): { value: string; unit: string } {
  const m = value.match(/^(-?\d[\d_]*(?:\.\d+)?|true|false|dynamic)\s+(.+)$/);
  return m ? { value: m[1]!, unit: m[2]! } : { value, unit: "" };
}

/** Parse the pinned paper, keeping line anchors and incomplete signatures. @example parseYellowpaper(raw, sha, time) */
export function parseYellowpaper(raw: string, sha: string, measuredAt: string): SpecModel {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Expected a full yellowpaper commit SHA");
  if (!Number.isFinite(Date.parse(measuredAt))) throw new Error("Invalid paper measurement time");
  if (raw.length > 2_000_000) throw new Error("Paper exceeds input limit");
  const items: Item[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let appendix = "";
  let section = "";
  let enforced = true;
  let table = "";
  let fenced = false;
  const add = (item: Item) => {
    if (seen.has(item.id)) throw new Error(`Duplicate spec identifier: ${item.id}`);
    seen.add(item.id);
    items.push(item);
  };
  raw.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const heading = line.match(/^##\s+Appendix ([A-Z])\b/);
    if (heading) {
      appendix = heading[1]!;
      section = appendix;
      table = "";
      return;
    }
    const sub = line.match(/^###\s+([A-Z]\.\d+)\b/);
    if (sub) {
      section = sub[1]!;
      table = "";
    }
    if (line.startsWith("**Reference-only**")) enforced = false;
    const row = cells(line);
    if (!row.length || row.every((c) => /^[-:]+$/.test(c))) return;
    if (
      row[0] === "Parameter" ||
      row[0] === "Extrinsic" ||
      row[0] === "Signature" ||
      row[0] === "Requirement / mechanism"
    ) {
      table = row.join("|");
      return;
    }
    const evidence: Evidence = {
      source: `https://github.com/flop-labs/yellowpaper/blob/${sha}/yellowpaper.md#L${index + 1}`,
      measuredAt,
      sha,
      line: index + 1,
      quote: line,
    };
    if (appendix === "A" && table.startsWith("Parameter|Value|")) {
      const name = row[0]!.match(/id="param-([^"]+)"/)?.[1] ?? row[0]!;
      if (row[1] === undefined) {
        warnings.push(`Incomplete parameter at line ${index + 1}`);
        return;
      }
      const scalar = splitValue(row[1]);
      add({
        id: `A:${name}`,
        appendix: "A",
        kind: "parameter",
        section: row[2] ?? "A",
        name,
        ...scalar,
        enforced: row[0]!.includes('id="param-') && enforced,
        evidence,
      });
    }
    if (appendix === "G" && (table.startsWith("Extrinsic|") || table.startsWith("Signature|"))) {
      // Only explicitly named code spans are calls. No expansion of create/redeem/refund_htlc or prose placeholders.
      const pallet =
        section === "G.1"
          ? "compute_channel"
          : section === "G.2"
            ? "flop_poui"
            : section === "G.3"
              ? row[1]?.match(/`([^`]+)`/)?.[1]
              : undefined;
      const spans = [...row[0]!.matchAll(/`([^`]+)`/g)];
      let added = false;
      for (const span of spans) {
        const m = span[1]!.match(/^([a-z][a-z0-9_]*)(?:\(([^()]*)\))?$/);
        if (!m) continue;
        // Parenthetical prose after the slash can mention deprecated calls. It is not an index entry.
        if ((span.index ?? 0) > row[0]!.indexOf("*(") && row[0]!.includes("*(")) continue;
        const args =
          m[2] === undefined || m[2].includes("...")
            ? null
            : m[2]
                .split(",")
                .map((a) => a.trim().split(":")[0]!)
                .filter(Boolean);
        if (args?.some((a) => !/^[a-z][a-z0-9_]*$/.test(a))) {
          warnings.push(`Unparsed arguments at line ${index + 1}`);
          continue;
        }
        const name = m[1]!;
        add({
          id: `G:${pallet ?? section}.${name}`,
          appendix: "G",
          kind: "call",
          section,
          name,
          pallet,
          arguments: args,
          value: span[1]!,
          unit: "",
          evidence,
        });
        added = true;
      }
      if (
        !added ||
        row[0]!.includes("create/redeem/refund_htlc") ||
        row[0]!.includes(" / unbond") ||
        row[0]!.startsWith("DA register")
      ) {
        add({
          id: `G:unresolved:${index + 1}`,
          appendix: "G",
          kind: "call",
          section,
          name: row[0]!,
          value: row[0]!,
          unit: "",
          arguments: null,
          evidence,
        });
      }
    }
    if (appendix === "H" && table.startsWith("Requirement / mechanism|")) {
      add({
        id: `H:${row[0]}`,
        appendix: "H",
        kind: "status",
        section,
        name: row[0]!,
        value: row.at(-1)!,
        unit: "",
        evidence,
      });
    }
  });
  for (const a of ["A", "G", "H"])
    if (!items.some((item) => item.appendix === a)) warnings.push(`No Appendix ${a} items parsed`);
  return { sha, measuredAt, items, warnings };
}

/** Reassemble raw paper chunks with contiguous line offsets and one pin. @example paperFromChunks(chunks) */
export function paperFromChunks(chunks: unknown[]): SpecModel {
  if (!chunks.length) throw new Error("No paper recording");
  let nextLine = 1;
  let sha = "";
  let measuredAt = "";
  const parts = chunks.map((value) => {
    const o = object(value);
    const r = parseRecording(value);
    if (o.startLine !== nextLine) throw new Error("Noncontiguous paper chunks");
    const pin = text(o.sha);
    if (sha && (sha !== pin || measuredAt !== r.measuredAt)) throw new Error("Mixed paper recordings");
    sha = pin;
    measuredAt = r.measuredAt;
    nextLine += r.raw.split("\n").length;
    return r.raw;
  });
  return parseYellowpaper(parts.join("\n"), sha, measuredAt);
}

/** Locate money-path cases and wire-profile families without claiming execution. @example parseVectors(recording, sha) */
export function parseVectors(value: unknown, sha: string): Item[] {
  const envelope = object(value);
  if (envelope.sha !== sha) throw new Error("Vector commit differs from paper commit");
  const r = parseRecording(value);
  const data = object(JSON.parse(r.raw));
  const rows: { name: string; value: unknown }[] = [];
  if (data.version === "flop-money-path-v1") {
    if (!Array.isArray(data.vectors)) throw new Error("Missing money-path vectors");
    for (const entry of data.vectors) {
      const v = object(entry);
      const name = text(v.id);
      object(v.input);
      if (v.status === "landed") object(v.expected);
      else if (v.status !== "pending") throw new Error("Unknown money-path vector status");
      rows.push({ name: `money-path:${name}`, value: v });
    }
  } else if (data.profile === "flop-wire-v1") {
    for (const [name, v] of Object.entries(data)) {
      if (name.endsWith("_v1")) {
        object(v);
        rows.push({ name: `wire:${name}`, value: v });
      }
    }
    if (!Array.isArray(data.negative_cases)) throw new Error("Missing wire rejection vectors");
    for (const entry of data.negative_cases) {
      const v = object(entry);
      rows.push({ name: `wire:reject:${text(v.id)}`, value: v });
    }
  } else throw new Error("Unknown vector profile");
  if (new Set(rows.map((r) => r.name)).size !== rows.length) throw new Error("Duplicate vector identifier");
  return rows.map(({ name, value }) => ({
    id: `V:${name}`,
    appendix: "V",
    kind: "vector",
    section: "Public vectors",
    name,
    value: JSON.stringify(value),
    unit: "",
    evidence: {
      source: r.source.replace(
        "raw.githubusercontent.com/flop-labs/yellowpaper/",
        "github.com/flop-labs/yellowpaper/blob/",
      ),
      measuredAt: r.measuredAt,
      sha,
      quote: JSON.stringify(value),
    },
  }));
}
