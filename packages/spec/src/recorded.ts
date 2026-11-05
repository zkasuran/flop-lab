// SPDX-License-Identifier: Apache-2.0
import p0 from "../fixtures/paper-0.json";
import p1 from "../fixtures/paper-1.json";
import p2 from "../fixtures/paper-2.json";
import p3 from "../fixtures/paper-3.json";
import p4 from "../fixtures/paper-4.json";
import p5 from "../fixtures/paper-5.json";
import money from "../fixtures/money-path-v1.json";
import wire from "../fixtures/wire-format-v1.json";
import catalog from "../fixtures/knowledge.json";
import stats from "../fixtures/stats.json";
import transactions from "../fixtures/transactions.json";
import transaction from "../fixtures/transaction.json";
import { paperFromChunks, parseVectors } from "./parser";
import { runtimeFromRecordings } from "./runtime";
import { compare } from "./compare";

/** Load the pinned paper and located vectors from raw recordings. @example recordedSpec().sha */
export function recordedSpec() {
  const model = paperFromChunks([p0, p1, p2, p3, p4, p5]);
  model.items.push(...parseVectors(money, model.sha), ...parseVectors(wire, model.sha));
  return model;
}

/** Replay the bundled observation without a network request. @example recordedReport().counts */
export function recordedReport() {
  const runtime = runtimeFromRecordings({ catalog, stats, transactions, transaction });
  return compare(recordedSpec(), runtime, { mode: "recorded", at: runtime.measuredAt ?? p0.measuredAt });
}
