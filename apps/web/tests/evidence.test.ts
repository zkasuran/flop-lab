// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { readClaimRun, type ClaimStatus } from "../lib/evidence";

it("links the displayed claim counts to their source manifest and result parts", async () => {
  const run = readClaimRun();
  expect(run).not.toBeNull();
  if (!run) throw new Error("Missing claim recording");

  const sourcePath = new URL(run.recording).pathname.replace(/^\/zkasuran\/flop-lab\/(tree|blob)\/main\//, "");
  const directory = new URL(`../../../${sourcePath}/`, import.meta.url);
  const manifest: {
    measuredAt: string;
    budget: { requests: number };
    resultFiles: string[];
  } = JSON.parse(await readFile(new URL("report.json", directory), "utf8"));
  const parts: { claim: { id: string }; status: ClaimStatus }[][] = await Promise.all(
    manifest.resultFiles.map(async (file) => JSON.parse(await readFile(new URL(file, directory), "utf8"))),
  );
  const results = parts.flat();

  expect(run.measuredAt).toBe(manifest.measuredAt);
  expect(run.requests).toBe(manifest.budget.requests);
  expect(run.claims.map((claim) => claim.id)).toEqual(results.map((result) => result.claim.id));
  for (const status of ["PASS", "FAIL", "UNVERIFIABLE", "SKIPPED"] as const) {
    expect(run.counts[status]).toBe(results.filter((result) => result.status === status).length);
  }
});
