// SPDX-License-Identifier: Apache-2.0
import catalog from "../fixtures/catalog.json";
import docs from "../fixtures/staking-and-slashing.json";
import miners from "../fixtures/miners.json";
import positions from "../fixtures/positions.json";
import stats from "../fixtures/stake-stats.json";
import { parseParameters, parseOffences } from "./sources";
import { auditStake } from "./observed";

export const parameters = parseParameters(catalog);
export const offences = parseOffences(docs, parameters);
export const recordedSnapshot = { miners, positions, stats };
/** Replay the bundled public recordings. No network access.
 * @example recordedReport().issue75.status === "UNVERIFIABLE"
 */
export function recordedReport() {
  return auditStake(recordedSnapshot, parameters);
}
