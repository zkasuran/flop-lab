// SPDX-License-Identifier: Apache-2.0
import p0 from "../../spec/fixtures/paper-0.json";
import p1 from "../../spec/fixtures/paper-1.json";
import p2 from "../../spec/fixtures/paper-2.json";
import p3 from "../../spec/fixtures/paper-3.json";
import p4 from "../../spec/fixtures/paper-4.json";
import p5 from "../../spec/fixtures/paper-5.json";
import issues from "../fixtures/issues.json";
import { paperFromChunks, recordedReport } from "@flop-lab/spec";
import { parseIssues } from "./issues";
import { buildReader } from "./reader";

/** Reassemble the existing byte-preserving paper recording after validation. @example recordedPaper().raw */
export function recordedPaper() {
  const chunks = [p0, p1, p2, p3, p4, p5];
  const paper = paperFromChunks(chunks);
  return { raw: chunks.map((chunk) => chunk.raw).join("\n"), sha: paper.sha, measuredAt: paper.measuredAt };
}

/** Read the pinned document with the spec differ's recorded catalog evidence. No network. @example recordedReader().headings */
export function recordedReader() {
  return buildReader(recordedPaper(), recordedReport());
}

/** Read dated public issue states. No network. @example recordedIssues().measuredAt */
export function recordedIssues() {
  return parseIssues(issues);
}
