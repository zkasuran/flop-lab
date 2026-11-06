// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { policy, request } from "./helpers";
import { FileLedger } from "../src/ledger";
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", cli, ...args], { encoding: "utf8" });

it("lints, reserves across invocations and replays a dated recording", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shared-cli-"));
  try {
    const policyFile = join(dir, "policy.json"),
      requestFile = join(dir, "request.json"),
      ledger = join(dir, "team.jsonl");
    await writeFile(policyFile, JSON.stringify({ ...policy, maxEscrowPerSession: "5", requireDryRun: true }));
    await writeFile(requestFile, JSON.stringify(request));
    expect(run("lint", policyFile).status).toBe(0);
    expect(run("shared-init", policyFile, ledger).status).toBe(0);
    expect(run("reserve", policyFile, ledger, "agent", requestFile).status).toBe(2);
    expect(run("reserve", policyFile, ledger, "agent", requestFile, "--preview").status).toBe(0);
    expect(run("reserve", policyFile, ledger, "agent", requestFile).status).toBe(0);
    expect((await new FileLedger(ledger).verify()).reservations).toHaveLength(1);
    const replay = run("replay", "examples/tape-policy.json", "fixtures/settlements.json");
    expect(replay.status).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      partial: true,
      capturedAt: "2026-11-06T04:06:11.831Z",
      totals: { allowed: 7, refused: 93, allowedFlop: "9.990000000000000164" },
    });
    expect(
      run("replay", policyFile, "fixtures/sdk-estimate.json", "--estimate", "agent", "model", "miner").status,
    ).toBe(0);
    expect(run("replay", policyFile, "fixtures/settlements.json", "--unknown").status).toBe(1);
    expect(run("reserve", policyFile, ledger, "agent", requestFile, "--unknown").status).toBe(1);
    await writeFile(policyFile, "{}");
    expect(run("lint", policyFile).status).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 15_000);

it("returns exit 2 with a sourced rule trace for a denied JSON request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spendguard-cli-"));
  try {
    const policyFile = join(dir, "policy.json"),
      requestFile = join(dir, "request.json");
    await writeFile(policyFile, JSON.stringify({ ...policy, denyMiners: ["miner"] }));
    await writeFile(requestFile, JSON.stringify(request));
    const result = run("evaluate", policyFile, requestFile, "--dry-run");
    expect(result.status).toBe(2);
    const report = JSON.parse(result.stdout) as { fired: string[]; source: { policy: string }; measuredAt: string };
    expect(report.fired).toContain("denyMiners");
    expect(report.source.policy).toBe(policyFile);
    expect(Number.isFinite(Date.parse(report.measuredAt))).toBe(true);
    expect(run("evaluate", policyFile, requestFile).status).toBe(1);
    expect(run("evaluate", policyFile, requestFile, "--dry-run", "--unknown").status).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("initializes once and returns exit 1 on an invalid external head", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spendguard-cli-"));
  try {
    const ledger = join(dir, "ledger.jsonl");
    expect(run("init", ledger).status).toBe(0);
    expect(run("init", ledger).status).toBe(1);
    expect(run("verify", ledger).status).toBe(0);
    expect(run("verify", ledger, "f".repeat(64)).status).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
