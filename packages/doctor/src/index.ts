// SPDX-License-Identifier: Apache-2.0
import { hostname } from "node:os";
import { performance } from "node:perf_hooks";
import { collect, type ProbeOptions } from "./probes.js";
import { evaluate, overall } from "./report.js";
import type { Report } from "./types.js";
export { collect, type ProbeOptions } from "./probes.js";
export { evaluate, overall, assessClock, markdown, accessRequest, externalCommands } from "./report.js";
export { sources, timingMaxClockSkewMs } from "./requirements.js";
export type * from "./types.js";

/** Run a read-only host preflight. Example: await diagnose({role: "miner", offline: true}). */
export async function diagnose(options: ProbeOptions & { includeHost?: boolean }): Promise<Report> {
  const start = performance.now();
  const measuredAt = new Date().toISOString();
  const { inventory, requests } = await collect(options);
  const requirements = evaluate(options.role, inventory);
  const report: Report = {
    schemaVersion: 1,
    role: options.role,
    measuredAt,
    status: overall(requirements.map((r) => r.status)),
    inventory,
    requirements,
    requests,
    durationMs: Math.round(performance.now() - start),
  };
  if (options.includeHost) report.host = hostname().replace(/[^a-zA-Z0-9.-]/g, "");
  return report;
}
