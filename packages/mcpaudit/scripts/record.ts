// SPDX-License-Identifier: Apache-2.0
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { runAudit, type Trace } from "../src/index";
const directory = new URL("../fixtures/", import.meta.url);
await mkdir(directory, { recursive: true });
const serialize = (value: unknown) =>
  JSON.stringify(value)
    .replace(/\u2013/g, "\\u2013")
    .replace(/\u2014/g, "\\u2014") + "\n";
const traces: Trace[] = [];
const report = await runAudit({
  onTrace: (trace) => {
    traces.push(trace);
  },
});
if (report.discoveryError) throw new Error(`Recording was not replaced: ${report.discoveryError}`);
const files = traces.map((trace) => {
  const { raw, ...metadata } = trace;
  const body = serialize(
    Buffer.byteLength(serialize(trace)) > 190_000
      ? { ...metadata, rawGzipBase64: gzipSync(raw).toString("base64") }
      : trace,
  );
  if (Buffer.byteLength(body) > 200_000) throw new Error("Fixture exceeds 200 KB limit");
  return { name: `audit-${trace.id}.json`, body };
});
const summary = serialize(report);
if (Buffer.byteLength(summary) > 200_000) throw new Error("Summary exceeds 200 KB limit; existing recording preserved");
for (const file of files) await writeFile(new URL(file.name, directory), file.body);
for (const name of await readdir(directory)) {
  if (/^audit-\d+\.json$/.test(name) && !files.some((file) => file.name === name))
    await unlink(new URL(name, directory));
}
await writeFile(new URL("../last-run.json", import.meta.url), summary);
console.log(
  JSON.stringify(
    {
      measuredAt: report.measuredAt,
      requests: report.requests,
      durationMs: report.durationMs,
      discoveryError: report.discoveryError,
      results: report.tools.map((tool) => ({
        name: tool.name,
        status: tool.status,
        findingCount: tool.observations.reduce((sum, observation) => sum + observation.findings.length, 0),
        schemaPaths: [...new Set(tool.observations.flatMap((o) => o.findings.map((f) => f.schemaPath)))],
      })),
      trust: report.trust,
    },
    null,
    2,
  ),
);
