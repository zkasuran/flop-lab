// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { readRecording } from "../../../apps/web/app/contracts/data";
import { counts, filterTools } from "../../../apps/web/app/contracts/model";

it("renders only validated dated observations and keeps unverifiable distinct from pass", () => {
  const report = readRecording();
  expect(report).not.toBeNull();
  expect(counts(report!)).toEqual({ VIOLATION: 2, UNVERIFIABLE: 30, PASS: 1, SKIPPED: 1 });
  expect(filterTools(report!.tools, "VIOLATION", "KNOWLEDGE")).toHaveLength(2);
  expect(filterTools(report!.tools, "all", "not-a-tool")).toEqual([]);
  expect(readRecording(null)).toBeNull();
  expect(readRecording({ ...report, measuredAt: "undated" })).toBeNull();
  expect(readRecording({ ...report, requests: -1 })).toBeNull();
  expect(readRecording({ ...report, tools: [report!.tools[0], report!.tools[0]] })).toBeNull();
  const changed = structuredClone(report!);
  changed.tools.find((tool) => tool.status === "VIOLATION")!.status = "PASS";
  expect(readRecording(changed)).toBeNull();
});
