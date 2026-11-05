// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { pickResponse } from "@flop-lab/mcp";
import { inspectTrust } from "../src/trust";
import { traces } from "../test/fixtures";
import type { AuditReport } from "../src/types";
const path = new URL("../last-run.json", import.meta.url);
const report = JSON.parse(await readFile(path, "utf8")) as AuditReport;
const decoded = (name: string) => {
  const trace = traces.find(
    (t) => t.request.params?.name === name && JSON.stringify(t.request.params.arguments) === "{}",
  );
  if (!trace) return null;
  const result = pickResponse(trace.raw, trace.request.id).result as { content: { text: string }[] };
  return JSON.parse(result.content[0]!.text) as unknown;
};
report.trust = inspectTrust(decoded("flop_trust_root"), decoded("flop_get_tcb_status"), report.measuredAt);
await writeFile(
  path,
  JSON.stringify(report)
    .replace(/\u2013/g, "\\u2013")
    .replace(/\u2014/g, "\\u2014") + "\n",
);
