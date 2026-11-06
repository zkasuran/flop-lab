// SPDX-License-Identifier: Apache-2.0
import { columnsFor, validateRow, type Dataset, type Format, type Cell, type Row } from "./schema";

function csvCell(value: Cell): string {
  if (value === null) return "";
  if (typeof value !== "string") return String(value);
  // Prefix formula-leading strings and apostrophes. Import these columns as text.
  const safe = /^[\s]*[=+\-@]|^[\t\r\n']/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
/** Encode a bounded part with an explicit schema, including empty sets. @example await encode("blocks", "csv", rows) */
export async function encode(dataset: Dataset, format: Format, input: Row[]): Promise<Uint8Array> {
  const rows = input.map((row) => validateRow(dataset, row));
  const columns = columnsFor(dataset);
  if (format === "ndjson") return Buffer.from(rows.map((r) => JSON.stringify(r) + "\n").join(""));
  if (format === "csv")
    return Buffer.from(
      [
        columns.map((c) => c.name).join(","),
        ...rows.map((r) => columns.map((c) => csvCell(r[c.name]!)).join(",")),
      ].join("\r\n") + "\r\n",
    );
  if (format !== "parquet") throw new Error("Unknown format");
  const { parquetWriteBuffer } = await import("hyparquet-writer");
  return new Uint8Array(
    parquetWriteBuffer({
      columnData: columns.map((c) => ({
        name: c.name,
        type:
          c.type === "string" ? "STRING" : c.type === "boolean" ? "BOOLEAN" : c.type === "integer" ? "INT64" : "DOUBLE",
        nullable: c.nullable,
        data: rows.map((r) => (c.type === "integer" && r[c.name] !== null ? BigInt(r[c.name] as number) : r[c.name]!)),
      })),
      codec: "UNCOMPRESSED",
      kvMetadata: [
        { key: "flop.export.schema", value: "1" },
        { key: "flop.export.dataset", value: dataset },
      ],
    }),
  );
}
