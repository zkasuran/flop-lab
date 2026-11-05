// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
it("runs recorded CLI output as structured JSON", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", cli, "watch", "--recorded", "--json", "--limit", "2"],
    { encoding: "utf8" },
  );
  const report = JSON.parse(output) as { tape: { mode: string }; rows: unknown[]; rankingCohort: number };
  expect(report.tape.mode).toBe("recorded");
  expect(report.rows).toHaveLength(2);
  expect(report.rankingCohort).toBe(336);
});

it("rejects submission flags and malformed limits before any network call", () => {
  for (const args of [
    ["dossier", "id", "--submit"],
    ["watch", "--limit", "NaN"],
    ["watch", "--limit", "0"],
    ["watch", "--json", "--json"],
  ]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", cli, ...args], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("flop-challenger:");
  }
});
