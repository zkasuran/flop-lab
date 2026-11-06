// SPDX-License-Identifier: Apache-2.0
import fixture from "../fixtures/snapshot.json" with { type: "json" };
import { parseSnapshot, type Snapshot } from "./model.js";
/** Read the bundled dated public projection without network calls. @example recordedSnapshot() */
export function recordedSnapshot(): Snapshot {
  return parseSnapshot(fixture);
}
