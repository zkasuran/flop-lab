// SPDX-License-Identifier: Apache-2.0
import security from "../../harness/fixtures/sources/paper-2046.json";
import failures from "../../harness/fixtures/sources/paper-2301.json";
import verifier from "../../verifier/fixtures/v2-channel.json";
import indexer from "../../indexer-audit/fixtures/devnet.json";
import tools from "../../harness/fixtures/coverage/run-1.json";
import health from "../../harness/fixtures/coverage/run-2.json";
import models from "../../harness/fixtures/coverage/run-4.json";
import trust from "../../harness/fixtures/coverage/run-5.json";
import catalog from "../../spec/fixtures/knowledge.json";
import stats from "../../spec/fixtures/stats.json";
import transactions from "../../spec/fixtures/transactions.json";
import transaction from "../../spec/fixtures/transaction.json";
import type { Inputs } from "./suites";
import { parseSections } from "./parser";

/** Original pinned slices with source and capture time. @example recordedSources()[0].url */
export function recordedSources() {
  return structuredClone([security, failures]);
}
/** Parse the recorded normative source. @example recordedCatalogue().find(r => r.id === "M1") */
export function recordedCatalogue() {
  return parseSections(recordedSources());
}
/** Native suite inputs, preserving raw response bytes and original capture times.
 * @example await runChecks(recordedInputs())
 */
export function recordedInputs(): Inputs {
  return structuredClone({
    verifier,
    indexer,
    harness: [tools, health, models, trust],
    spec: { catalog, stats, transactions, transaction },
  });
}
