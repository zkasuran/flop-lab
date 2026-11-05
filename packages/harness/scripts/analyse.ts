// SPDX-License-Identifier: Apache-2.0
import { readFile, stat } from "node:fs/promises";
import { parseReport } from "../src/report";
const report = parseReport(JSON.parse(await readFile(new URL("../last-run.json", import.meta.url), "utf8")));
for (const result of report.results.filter((result) => result.status === "FAIL"))
  console.log(
    JSON.stringify(
      {
        id: result.claim.id,
        attempts: result.attempts.map((attempt) => ({
          observed: JSON.stringify(attempt.observed).slice(0, 1500),
          reason: attempt.reason,
        })),
      },
      null,
      2,
    ),
  );
console.log(
  JSON.stringify({
    bytes: (await stat(new URL("../last-run.json", import.meta.url))).size,
    settlement: report.results.find((result) => result.claim.id === "settlement-conservation")?.attempts[0]?.observed,
  }),
);
