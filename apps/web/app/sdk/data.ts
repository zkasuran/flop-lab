// SPDX-License-Identifier: Apache-2.0
import recording from "../../../../packages/sdkconf/fixtures/report.json";
import { parseReport } from "../../../../packages/sdkconf/src/model";
import type { Report } from "../../../../packages/sdkconf/src/model";

/** Validate the recorded CLI report before rendering. @example readReport() */
export function readReport(value: unknown = recording): Report | null {
  try {
    return parseReport(value);
  } catch {
    return null;
  }
}
