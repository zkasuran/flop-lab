// SPDX-License-Identifier: Apache-2.0
import {
  datasets,
  formats,
  type Dataset,
  type Format,
  type Row,
  type Column,
} from "../../../../packages/export/src/schema";
export type Sample = { dataset: Dataset; rows: Row[]; columns: Column[]; measuredAt: string[]; sources: string[] };
export type Selection = { dataset: Dataset; format: Format; offset: string; rows: string; recorded: boolean };
/** Build a shell-safe checkout command from validated controls. @example commandFor({ dataset: "blocks", format: "csv", offset: "0", rows: "100", recorded: true }) */
export function commandFor(s: Selection): string | null {
  if (!datasets.includes(s.dataset) || !formats.includes(s.format) || !/^\d+$/.test(s.offset) || !/^\d+$/.test(s.rows))
    return null;
  const offset = Number(s.offset),
    rows = Number(s.rows);
  if (
    !Number.isSafeInteger(offset) ||
    offset > 2_000_000_000 ||
    !Number.isSafeInteger(rows) ||
    rows < 1 ||
    rows > 1_000_000
  )
    return null;
  const input = s.recorded
    ? " --recorded"
    : s.dataset === "accounts"
      ? " --addresses ./addresses.txt"
      : s.dataset === "snapshots"
        ? " --archive ./archive"
        : "";
  return `node packages/cli/dist/cli.js export ${s.dataset}${input} --format ${s.format} --offset ${offset} --rows ${rows} --max-requests 10 --out ./export-${s.dataset}-${s.format}`;
}
