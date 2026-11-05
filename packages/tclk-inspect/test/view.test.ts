// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { projectTranscript } from "../../../apps/web/app/tclk/view";
import { inspectTranscript } from "../src/inspect";
import { simulate } from "../src/simulate";
import { parseHtlcs } from "../src/chain";
import recording from "../fixtures/htlcs.json";

it("keeps the rejected reveal at its original record index and locked state when filtering", () => {
  const report = inspectTranscript(simulate("wrong-preimage"));
  const projection = projectTranscript(report, 3, true, []);
  expect(projection.visible.map((step) => step.index)).toEqual([3]);
  expect(projection.selectedState).toBe("locked");
  expect(projection.passed).toBe(3);
  expect(projectTranscript(report, 0, false, []).selectedState).toBe("proposed");
  expect(report.state?.status).toBe("locked");
});
it("does not turn empty input or a point statement into a hash observation", () => {
  const rows = parseHtlcs(JSON.parse(recording.raw));
  const empty = projectTranscript(inspectTranscript([]), 0, false, rows);
  expect(empty.selectedState).toBe("none");
  expect(empty.visible).toEqual([]);
  expect(empty.hash).toBeUndefined();
  expect(empty.matches).toEqual([]);
  expect(projectTranscript(inspectTranscript(simulate("point")), 3, false, rows).matches).toEqual([]);
});
it("compares exact hash bytes within the recorded sample and never treats a different row as a match", () => {
  const rows = parseHtlcs(JSON.parse(recording.raw));
  const report = inspectTranscript(simulate("happy"));
  expect(projectTranscript(report, 3, false, rows).matches).toEqual([]);
  report.state!.statement = rows[0]!.hashLock;
  const matches = projectTranscript(report, 3, false, rows).matches;
  expect(matches.length).toBeGreaterThan(0);
  expect(matches.every((row) => row.hashLock === report.state!.statement)).toBe(true);
  expect(projectTranscript(report, 3, false, []).matches).toEqual([]);
});
