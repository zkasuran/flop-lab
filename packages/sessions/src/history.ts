// SPDX-License-Identifier: Apache-2.0
import { parseSnapshot } from "../../recorder/src/schema";
import { classifyCapture, type Report } from "./classify";
import { source } from "./schema";
/** Derive sample state counts from a digest-checked recorder snapshot.
 * Unavailable settlement observations remain gaps. No full channel history is inferred.
 * @example await recorderSample(JSON.parse(snapshotJson))
 */
export async function recorderSample(input: unknown): Promise<Report> {
  const snapshot = await parseSnapshot(input);
  const o = snapshot.observations.settlements;
  const expectedSource = `${source} ${JSON.stringify({ name: "flop_list_settlements", arguments: { limit: 5, offset: 0 } })}`;
  if (o.source !== expectedSource) throw new Error("Unsupported recorder settlement source");
  const report = classifyCapture({
    version: 1,
    startedAt: snapshot.startedAt,
    finishedAt: snapshot.finishedAt,
    requests: 0,
    durationMs: 0,
    observations: [
      {
        kind: "settlements",
        source,
        measuredAt: o.measuredAt,
        offset: 0,
        raw: o.status === "ok" ? JSON.stringify(o.value) : null,
        error: o.error,
      },
    ],
  });
  report.warnings.unshift("Recorder settlement sample only. The recorder does not store channel state snapshots.");
  for (const session of report.sessions)
    for (const evidence of session.evidence) evidence.fields.recorderSource = o.source;
  return report;
}
