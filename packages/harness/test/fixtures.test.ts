// SPDX-License-Identifier: Apache-2.0
import { readFile, readdir, stat } from "node:fs/promises";
import { expect, it } from "vitest";
import { loadClaims } from "../src/catalogue";
import { parseReport } from "../src/report";
import { main } from "../src/cli";

it("keeps every committed recording below the repository byte ceiling", async () => {
  const directory = new URL("../fixtures/", import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => name.endsWith(".json"))) {
    const file = new URL(name, directory);
    expect((await stat(file)).size, name).toBeLessThanOrEqual(200_000);
    const record = JSON.parse(await readFile(file, "utf8")) as {
      measuredAt: string;
      request: { url: string };
      response: string;
    };
    expect(Date.parse(record.measuredAt), name).not.toBeNaN();
    expect(record.request.url, name).toMatch(/^https:\/\/(mcp|api)\.flop\.network\//);
    expect(typeof record.response, name).toBe("string");
  }
  expect((await stat(new URL("../last-run.json", import.meta.url))).size).toBeLessThanOrEqual(200_000);
});

it("commits a dated summary whose catalogue and raw evidence references exist", async () => {
  const report = parseReport(JSON.parse(await readFile(new URL("../last-run.json", import.meta.url), "utf8")));
  const claims = await loadClaims();
  // This dated pre-extraction recording remains a historical run. The expanded archive is checked separately.
  expect(report.results.every((result) => claims.some((claim) => claim.id === result.claim.id))).toBe(true);
  for (const evidence of report.evidence) {
    expect(evidence.rawFixture).toMatch(/^fixtures\/run-\d+\.json$/);
    await expect(stat(new URL(`../${evidence.rawFixture}`, import.meta.url))).resolves.toBeDefined();
  }
});

it.each([
  ["run", "--max-requests", "-1"],
  ["run", "--class", "mainnet"],
  ["run", "--only"],
  ["run", "--out", "same.json", "--markdown", "same.json"],
  ["run", "--out", "same.json", "--markdown", "./same.json"],
  ["report"],
  ["list", "--allow-spend"],
])("rejects invalid CLI input before any network request: %j", async (...args) => {
  await expect(main(args)).rejects.toThrow();
});
