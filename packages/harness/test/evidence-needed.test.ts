// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { loadClaims } from "../src/catalogue";
import { parseReport } from "../src/report";
import { runHarness } from "../src/runner";
import { Transport } from "../src/transport";
import { recordedFetch } from "./replay";

it("gives every recorded UNVERIFIABLE claim a specific public evidence requirement", async () => {
  const claims = await loadClaims();
  const report = parseReport(JSON.parse(await readFile(new URL("../last-run.json", import.meta.url), "utf8")));
  for (const result of report.results.filter((result) => result.status === "UNVERIFIABLE")) {
    const claim = claims.find((claim) => claim.id === result.claim.id)!;
    expect(claim.evidenceNeeded, claim.id).toBeTruthy();
    expect(result.reason, claim.id).toContain(claim.evidenceNeeded);
  }
});

it("carries catalog evidence needs into the runner reason shown by the page", async () => {
  const claims = (await loadClaims()).filter((claim) => claim.id === "block-time");
  const report = await runHarness({ claims, transport: new Transport({ fetch: recordedFetch(), intervalMs: 0 }) });
  expect(report.results[0]!.status).toBe("UNVERIFIABLE");
  expect(report.results[0]!.reason).toContain(`Public data needed: ${claims[0]!.evidenceNeeded}`);
});
