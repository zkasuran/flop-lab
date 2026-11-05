// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { createAuditor } from "../src/index";

const report = await createAuditor({ cacheTtlMs: 0 }).run({ limit: 3 });
await writeFile(new URL("../fixtures/devnet.json", import.meta.url), JSON.stringify(report.snapshot, null, 2) + "\n");
console.log(
  JSON.stringify({
    counts: report.counts,
    requests: report.snapshot.requests,
    durationMs: report.snapshot.durationMs,
    measuredAt: report.snapshot.completedAt,
    failures: report.findings
      .filter((f) => f.status === "FAIL")
      .map((f) => ({ id: f.id, left: f.left.value, right: f.right.value })),
  }),
);
