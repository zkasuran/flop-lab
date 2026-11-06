// SPDX-License-Identifier: Apache-2.0
export const datasets = [
  "settlements",
  "channels",
  "blocks",
  "transactions",
  "accounts",
  "models",
  "price-sources",
  "proofs",
  "snapshots",
] as const;
export type Dataset = (typeof datasets)[number];
export const formats = ["csv", "ndjson", "parquet"] as const;
export type Format = (typeof formats)[number];
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
export type Column = { name: string; type: "string" | "integer" | "number" | "boolean"; nullable: boolean };
function cols(text: string): Column[] {
  return text.split(" ").map((field) => {
    const [name, kind = "s"] = field.split(":");
    return {
      name: name!,
      type: kind[0] === "i" ? "integer" : kind[0] === "n" ? "number" : kind[0] === "b" ? "boolean" : "string",
      nullable: kind.endsWith("?"),
    };
  });
}
const fields: Record<Dataset, string> = {
  settlements:
    "channelId settledBlock:i settledAt:n agent:s? miner:s? escrow minerPaid burned aggregateGn unusedEscrow pricePerGflop cooperative:b? settlementKind settlementEvent marketKind modelHash:s? selfTrade:b",
  channels:
    "channelId agent:s? miner:s? escrow status paymentStatus:s? evidenceStatus:s? aggregateGn:s? minerPaid:s? burned:s? refunded:s? modelHash:s? challengeEnd:i? marketKind openedBlock:i openedAt:n updatedAt:n",
  blocks: "hash parentHash:s? number:i timestamp:n? extrinsicsCount:i? specVersion:i?",
  transactions:
    "hash blockHash:s? blockNumber:i? indexInBlock:i? section:s? method:s? sender:s? args:s? success:i? timestamp:n?",
  accounts: "address found:b balance:s? nonce:i? firstSeenBlock:i? lastSeenBlock:i? txCount:i?",
  models: "modelId registryName registryVersion:s? promptPrice:s? completionPrice:s?",
  "price-sources": "modelId address label version effectiveAt expiresAt",
  proofs: "id blockHash:s? blockNumber:i? submitter:s? gnWeight:n? successCount:i? taskHash:s? timestamp:n?",
  snapshots: "snapshotId startedAt finishedAt observation status valueJson error:s?",
};
/** Stable v1 columns shared by all formats. @example columnsFor("blocks") */
export function columnsFor(dataset: Dataset): Column[] {
  if (!datasets.includes(dataset)) throw new Error("Unknown dataset");
  return [...cols(fields[dataset]), ...cols("source measuredAt")];
}
/** Validate and project a row without coercion or integer rounding. @example validateRow("blocks", row) */
export function validateRow(dataset: Dataset, input: unknown): Row {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected row object");
  const row = input as Record<string, unknown>;
  return Object.fromEntries(
    columnsFor(dataset).map((c) => {
      const value = row[c.name];
      if (value === null && c.nullable) return [c.name, null];
      const good =
        c.type === "integer"
          ? typeof value === "number" && Number.isSafeInteger(value)
          : c.type === "number"
            ? typeof value === "number" && Number.isFinite(value)
            : typeof value === c.type;
      if (!good || (typeof value === "string" && value.length > 200_000)) throw new Error(`Invalid column ${c.name}`);
      if (c.name === "measuredAt" && (typeof value !== "string" || !Number.isFinite(Date.parse(value))))
        throw new Error("Invalid measurement time");
      return [c.name, value as Cell];
    }),
  );
}
export type Plan = {
  version: 1;
  dataset: Dataset;
  format: Format;
  offset: number;
  rows: number;
  pageSize: number;
  addresses: string[];
  archive: string | null;
  recorded: boolean;
};
/** Validate the saved query and its hard limits. @example parsePlan({ ...plan, rows: 100 }) */
export function parsePlan(value: unknown): Plan {
  if (!value || typeof value !== "object") throw new Error("Invalid export plan");
  const p = value as Plan;
  if (p.version !== 1 || !datasets.includes(p.dataset) || !formats.includes(p.format))
    throw new Error("Invalid export plan");
  for (const [key, min, max] of [
    ["offset", 0, 2_000_000_000],
    ["rows", 1, 1_000_000],
    ["pageSize", 1, 100],
  ] as const) {
    if (!Number.isSafeInteger(p[key]) || p[key] < min || p[key] > max) throw new Error(`Invalid ${key}`);
  }
  if (typeof p.recorded !== "boolean" || (p.archive !== null && (typeof p.archive !== "string" || !p.archive)))
    throw new Error("Invalid input mode");
  if (
    !Array.isArray(p.addresses) ||
    p.addresses.length > 10_000 ||
    p.addresses.some((a) => typeof a !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{46,50}$/.test(a)) ||
    new Set(p.addresses).size !== p.addresses.length
  )
    throw new Error("Invalid or duplicate addresses");
  if (p.dataset === "accounts" && !p.recorded && !p.addresses.length)
    throw new Error("Accounts need --addresses. The public schema has no account list.");
  if (p.dataset === "snapshots" && !p.recorded && !p.archive) throw new Error("Snapshots need --archive");
  return {
    version: 1,
    dataset: p.dataset,
    format: p.format,
    offset: p.offset,
    rows: p.rows,
    pageSize: p.pageSize,
    addresses: p.addresses,
    archive: p.archive,
    recorded: p.recorded,
  };
}
