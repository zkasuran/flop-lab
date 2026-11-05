// SPDX-License-Identifier: Apache-2.0
import recording from "../../../../packages/harness/last-run.json";
import { parseReport } from "../../../../packages/harness/src/report";
import type { RunReport } from "./model";

/** Validate the CLI recording before it crosses into the browser. @example readRecording() */
export function readRecording(value: unknown = recording): RunReport | null {
  try {
    return parseReport(value);
  } catch {
    return null;
  }
}
