// SPDX-License-Identifier: Apache-2.0
import type { Inspection } from "../../../../packages/tclk-inspect/src/model";
import type { HtlcRow } from "../../../../packages/tclk-inspect/src/chain";

/** Project a selected record without changing its fold verdict. Example: projectTranscript(report, 3, true, []).step?.to. */
export function projectTranscript(report: Inspection, selected: number, onlyBad: boolean, rows: HtlcRow[]) {
  const step = report.steps.find((entry) => entry.index === selected);
  const hash = report.state?.offer.lock === "hash" ? report.state.statement : undefined;
  return {
    step,
    passed: report.steps.filter((entry) => entry.ok).length,
    visible: report.steps.filter((entry) => !onlyBad || !entry.ok),
    selectedState: step?.to ?? report.state?.status ?? "none",
    hash,
    matches: hash ? rows.filter((row) => row.hashLock === hash) : [],
  };
}
