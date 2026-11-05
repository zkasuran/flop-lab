// SPDX-License-Identifier: Apache-2.0
import { parseStats } from "@flop-lab/mcp";
import { cells } from "./parser";
import { object, parseRecording, text, type Item, type Recording, type RuntimeModel } from "./model";

function evidence(r: Recording, quote: string) {
  return { source: `${r.source}#${r.tool ?? "observation"}`, measuredAt: r.measuredAt, quote };
}

// The generated Markdown catalog retains YAML scalar quoting. Remove only matching outer quotes.
function scalar(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return text(JSON.parse(value));
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'"))
    return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

/** Parse catalog rows by exact identifiers. These are source claims, not queried storage. @example parseCatalog(recording) */
export function parseCatalog(value: unknown): { parameters: Item[]; warnings: string[] } {
  const r = parseRecording(value);
  const data = object(JSON.parse(r.raw));
  const content = text(data.content);
  if (object(data.concept).id !== "protocol-params") throw new Error("Unexpected catalog concept");
  if (!Array.isArray(data.warnings) || data.warnings.some((w) => typeof w !== "string"))
    throw new Error("Invalid catalog warnings");
  const parameters: Item[] = [];
  let inTable = false;
  const names = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const row = cells(line);
    if (row[0] === "Name" && row[1] === "Value" && row[2] === "Unit") {
      inTable = true;
      continue;
    }
    if (!inTable || !row.length || row.every((c) => /^[-:]+$/.test(c))) continue;
    if (!line.startsWith("|")) {
      inTable = false;
      continue;
    }
    const name = row[0]?.match(/^`([a-z][a-z0-9_]*)`$/)?.[1];
    if (!name || row.length < 3) throw new Error("Malformed catalog parameter");
    if (names.has(name)) throw new Error(`Duplicate catalog parameter: ${name}`);
    names.add(name);
    parameters.push({
      id: `A:${name}`,
      appendix: "A",
      kind: "parameter",
      name,
      section: "protocol-params",
      value: scalar(row[1]!),
      unit: scalar(row[2]!),
      evidence: evidence(r, line),
    });
  }
  if (!inTable && !parameters.length) throw new Error("Catalog parameter table unavailable");
  return { parameters, warnings: data.warnings as string[] };
}

// Explicit spellings of pallet names in the indexer's JSON. No general camel/snake case matching.
const pallets: Record<string, string> = {
  computeChannel: "compute_channel",
  flopPoui: "flop_poui",
  minerStaking: "miner_staking",
  hwCalibration: "hw_calibration",
  airdropVesting: "airdrop_vesting",
  workVesting: "work_vesting",
  modelRegistry: "model_registry",
  daRegistry: "da_registry",
  hasStation: "has-station",
};

/** Read observed top-level calls. Positional argument values never establish argument names. @example parseTransactions(recording) */
export function parseTransactions(value: unknown): { calls: Item[]; count: number } {
  const r = parseRecording(value);
  const data = object(JSON.parse(r.raw));
  const rows =
    data.transactions ??
    (data.transaction === null ? [] : data.transaction === undefined ? undefined : [data.transaction]);
  if (!Array.isArray(rows)) throw new Error("Indexer transactions missing");
  if (rows.length > 100) throw new Error("Transaction sample exceeds limit");
  const calls = new Map<string, Item>();
  for (const value of rows) {
    const row = object(value);
    const section = text(row.section);
    const method = text(row.method);
    const hash = text(row.hash);
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(section) ||
      !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(method) ||
      !/^0x[a-fA-F0-9]{64}$/.test(hash)
    )
      throw new Error("Invalid indexed call identity");
    if (
      !Number.isSafeInteger(row.blockNumber) ||
      (row.blockNumber as number) < 0 ||
      ![0, 1].includes(row.success as number) ||
      typeof row.timestamp !== "number" ||
      !Number.isFinite(row.timestamp)
    )
      throw new Error("Invalid transaction observation");
    const args = JSON.parse(text(row.args)) as unknown;
    if (!Array.isArray(args)) throw new Error("Indexer argument values must be an array");
    const pallet = pallets[section] ?? section;
    // Keep the method exactly as exposed. A camelCase method is not equated with snake_case.
    const id = `G:${pallet}.${method}`;
    if (!calls.has(id))
      calls.set(id, {
        id,
        appendix: "G",
        kind: "call",
        section: "Indexed top-level calls",
        name: method,
        pallet,
        arguments: null,
        value: `${section}.${method}`,
        unit: "",
        evidence: evidence(r, JSON.stringify(row)),
      });
  }
  return { calls: [...calls.values()], count: rows.length };
}

/** Build a partial runtime view, retaining failures rather than inventing empty results. @example runtimeFromRecordings({catalog, transactions, stats}) */
export function runtimeFromRecordings(records: {
  catalog?: unknown;
  transactions?: unknown;
  stats?: unknown;
  transaction?: unknown;
}): RuntimeModel {
  const result: RuntimeModel = {
    parameters: [],
    calls: [],
    stats: null,
    catalogAvailable: false,
    transactionCount: 0,
    warnings: [],
    measuredAt: null,
  };
  const times: string[] = [];
  for (const [key, value] of Object.entries(records)) {
    if (value === undefined) continue;
    try {
      const r = parseRecording(value);
      if (key === "catalog") {
        const c = parseCatalog(value);
        result.parameters = c.parameters;
        result.catalogAvailable = true;
        result.warnings.push(...c.warnings);
      } else if (key === "stats") {
        parseStats(JSON.parse(r.raw));
        result.stats = evidence(r, r.raw);
      } else {
        const parsed = parseTransactions(value);
        if (key === "transactions") result.transactionCount = parsed.count;
        for (const call of parsed.calls) if (!result.calls.some((c) => c.id === call.id)) result.calls.push(call);
      }
      times.push(r.measuredAt);
    } catch (error) {
      result.warnings.push(`${key}: ${String(error)}`);
    }
  }
  result.measuredAt = times.sort().at(-1) ?? null;
  if (!result.catalogAvailable)
    result.warnings.push("Parameter catalog unavailable; absence cannot establish SPEC_ONLY");
  if (!records.transactions) result.warnings.push("No indexed transaction sample");
  return result;
}
