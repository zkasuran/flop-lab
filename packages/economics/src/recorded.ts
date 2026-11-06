// SPDX-License-Identifier: Apache-2.0
import fixture from "../fixtures/devnet.json";
import { parseObservation } from "./observe";
/** Validate the dated bundled devnet recording. @example recordedObservation().measuredAt */
export function recordedObservation() {
  return parseObservation(fixture);
}
