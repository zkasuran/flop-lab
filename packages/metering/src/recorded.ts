// SPDX-License-Identifier: Apache-2.0
import miners from "../fixtures/miners.json";
import stats from "../fixtures/stats.json";
import { auditSnapshot, type Snapshot } from "./observed";
export const recordedSnapshot: Snapshot = { miners, stats };
/** Read the bundled dated devnet recording without network requests.
 * @example recordedReport().miners
 */
export function recordedReport() {
  return auditSnapshot(recordedSnapshot);
}
