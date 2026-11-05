// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { loadClaims } from "../src/catalogue";
import { parseReport, renderMarkdown } from "../src/report";
import { serialize } from "../src/validation";
const path = new URL("../last-run.json", import.meta.url);
const report = parseReport(JSON.parse(await readFile(path, "utf8")));
const claims = await loadClaims();
for (const result of report.results) {
  result.claim = claims.find((claim) => claim.id === result.claim.id)!;
  if (result.status === "UNVERIFIABLE" && result.claim.evidenceNeeded)
    result.reason = `${result.reason.split(" Public data needed:")[0]} Public data needed: ${result.claim.evidenceNeeded}`;
}
await writeFile(path, serialize(report, 0));
await writeFile(new URL("../last-run.md", import.meta.url), renderMarkdown(report));
