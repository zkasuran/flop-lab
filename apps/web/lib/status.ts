// SPDX-License-Identifier: Apache-2.0
// Result vocabulary shared by server and browser code. Keep this module free of data imports.

export type ClaimStatus = "PASS" | "FAIL" | "UNVERIFIABLE" | "SKIPPED";

/** Display order for recorded outcomes. */
export const STATUS_ORDER: readonly ClaimStatus[] = ["PASS", "FAIL", "UNVERIFIABLE", "SKIPPED"];

const LABELS: Readonly<Record<string, string>> = {
  PASS: "Pass",
  FAIL: "Fail",
  UNVERIFIABLE: "Unverifiable",
  SKIPPED: "Skipped",
  NOT_APPLICABLE: "Not applicable",
};

/** Plain label for a harness or verifier result. Unknown values are shown as recorded. @example statusLabel("UNVERIFIABLE") */
export function statusLabel(status: string): string {
  return LABELS[status] ?? status;
}
