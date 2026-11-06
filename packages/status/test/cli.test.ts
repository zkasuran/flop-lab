// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseHistory } from "../src/schema";

const run = (args: string[], inject = "") =>
  spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      ...(inject ? ["--import", `data:text/javascript,${encodeURIComponent(inject)}`] : []),
      "src/cli.ts",
      ...args,
    ],
    { encoding: "utf8", timeout: 15_000 },
  );
it("prints help without requests and rejects unknown commands and invalid deadlines", () => {
  expect(run(["--help"]).stdout).toContain("flop-status");
  expect(run(["wat"]).status).toBe(2);
  expect(run(["probe", "--timeout-ms", "NaN"]).status).toBe(2);
  expect(run(["probe", "--file", "no"]).status).toBe(2);
});
it("analyzes bundled JSONL offline with a stated window and count", () => {
  const result = run(["history", "--file", "test/fixtures/history.jsonl", "--json"]);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout) as { window: { from: string }; services: { samples: number }[] };
  expect(report.window.from).toMatch(/^2026-/);
  expect(report.services.every((s) => s.samples === 2)).toBe(true);
});
it("archives failed probes before exiting one", async () => {
  const root = await mkdtemp(join(tmpdir(), "status-cli-"));
  try {
    const result = run(
      ["probe", "--archive", root, "--json"],
      'globalThis.fetch = async () => new Response("busy", {status: 503});',
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).requests).toBe(8);
    const saved = parseHistory(await readFile(join(root, "status/recent.jsonl"), "utf8"));
    expect(saved[0]?.probes.every((p) => p.outcome === "http-error")).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
