// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { columnsFor, datasets } from "../../../../packages/export/src/schema";
import { recordedReader } from "../../../../packages/export/src/recorded";
import { ExportView } from "./view";
export const metadata: Metadata = {
  title: "Data export",
  description:
    "Preview dated devnet rows and copy a bounded CSV, NDJSON or Parquet export command with per-file manifests.",
};
export default async function ExportPage() {
  const samples = await Promise.all(
    datasets.map(async (dataset) => {
      const page = await (await recordedReader(dataset)).read(0, 100);
      return {
        dataset,
        rows: page.rows,
        columns: columnsFor(dataset),
        measuredAt: [...new Set(page.captures.map((c) => c.measuredAt))],
        sources: [...new Set(page.captures.map((c) => c.source))],
      };
    }),
  );
  return <ExportView samples={samples} />;
}
