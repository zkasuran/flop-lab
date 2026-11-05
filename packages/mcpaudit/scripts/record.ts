// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { runAudit } from "../src/index";
const directory = new URL("../fixtures/", import.meta.url);
await mkdir(directory, { recursive: true });
const serialize = (value: unknown) =>
  JSON.stringify(value)
    .replace(/\u2013/g, "\\u2013")
    .replace(/\u2014/g, "\\u2014") + "\n";
const report = await runAudit({
  onTrace: async (trace) => {
    const { raw, ...metadata } = trace;
    const body = serialize(
      Buffer.byteLength(serialize(trace)) > 190_000
        ? { ...metadata, rawGzipBase64: gzipSync(raw).toString("base64") }
        : trace,
    );
    if (Buffer.byteLength(body) > 200_000) throw new Error("Fixture exceeds 200 KB limit");
    await writeFile(new URL(`audit-${trace.id}.json`, directory), body);
  },
});
await writeFile(new URL("../last-run.json", import.meta.url), serialize(report));
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
        findings: tool.observations.flatMap((o) => o.findings.map((f) => f.schemaPath)),
      })),
      trust: report.trust,
    },
    null,
    2,
  ),
);
