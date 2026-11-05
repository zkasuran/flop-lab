// SPDX-License-Identifier: Apache-2.0
import { readFile, stat } from "node:fs/promises";
import { expect, it } from "vitest";
import { loadCoverageRecording } from "../src/recording";
import { loadClaims } from "../src/catalogue";
import { parseClaimHistory, fetchClaimHistory } from "../src/history";
import { object } from "../src/validation";

it("records the complete expanded catalog, a bounded run and every referenced raw response", async () => {
  const report = await loadCoverageRecording();
  expect(report.results.map((result) => result.claim.id).sort()).toEqual(
    (await loadClaims()).map((claim) => claim.id).sort(),
  );
  expect(report.budget.requests).toBeLessThanOrEqual(80);
  expect(report.budget.requests).toBe(report.evidence.length);
  for (const evidence of report.evidence) {
    expect(evidence.rawFixture).toMatch(/^fixtures\/coverage\/run-\d+\.json$/);
    const path = new URL(`../${evidence.rawFixture}`, import.meta.url);
    expect((await stat(path)).size).toBeLessThan(200_000);
    const raw = object(JSON.parse(await readFile(path, "utf8")));
    expect(raw.measuredAt).toBe(evidence.measuredAt);
    expect(raw.request).toEqual(evidence.request);
  }
  for (const result of report.results.filter((result) => result.status === "FAIL")) {
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]!.evidence).not.toEqual(result.attempts[1]!.evidence);
  }
});

it("replays the real absent data-branch observation without inventing history", async () => {
  const fixture = object(
    JSON.parse(await readFile(new URL("../fixtures/coverage/history-response.json", import.meta.url), "utf8")),
  );
  const history = await fetchClaimHistory(
    async () => new Response(String(fixture.raw), { status: Number(fixture.status) }),
  );
  expect(history.state).toBe("empty");
  expect(history.runs).toEqual(parseClaimHistory({ version: 1, entries: [] }));
});
