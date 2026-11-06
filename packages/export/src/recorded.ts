// SPDX-License-Identifier: Apache-2.0
import settlements from "../fixtures/settlements.json" with { type: "json" };
import channels from "../fixtures/channels.json" with { type: "json" };
import blocks from "../fixtures/blocks.json" with { type: "json" };
import transactions from "../fixtures/transactions.json" with { type: "json" };
import accounts from "../fixtures/accounts.json" with { type: "json" };
import models from "../fixtures/models.json" with { type: "json" };
import prices from "../fixtures/price-sources.json" with { type: "json" };
import proofs from "../fixtures/proofs.json" with { type: "json" };
import snapshots from "../fixtures/snapshots.json" with { type: "json" };
import { rowsFromCapture, type Capture, type Reader } from "./source";
import { datasets, type Dataset } from "./schema";
const captures = {
  settlements,
  channels,
  blocks,
  transactions,
  accounts,
  models,
  "price-sources": prices,
  proofs,
  snapshots,
};
/** Read bundled raw observations through the same validators as live data. No network calls.
 * @example const reader = await recordedReader("settlements")
 */
export async function recordedReader(dataset: Dataset): Promise<Reader> {
  if (!datasets.includes(dataset)) throw new Error("Unknown dataset");
  const inputs = captures[dataset].map((c) => ({ ...c, dataset })) as Capture[];
  const rows = (await Promise.all(inputs.map(rowsFromCapture))).flatMap((p) => p.rows);
  return {
    requests: 0,
    async read(offset, limit) {
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new Error("Invalid page range");
      const selected = rows.slice(offset, offset + limit);
      return {
        rows: selected,
        consumed: selected.length,
        exhausted: offset + limit >= rows.length,
        captures: inputs.map(({ raw: _raw, ...meta }) => meta),
      };
    },
  };
}
