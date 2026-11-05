// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { parseSnapshot } from "../src/index";

const file = fileURLToPath(new URL("../fixtures/snapshot-01.json", import.meta.url));
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", cli, ...args], { encoding: "utf8" });
it("outputs offline snapshot JSON that passes read-time validation", () => {
  const result = run("snapshot", "--file", file, "--json");
  expect(result.status).toBe(0);
  expect(parseSnapshot(JSON.parse(result.stdout)).schemaVersion).toBe(1);
});
it("returns typed no-route JSON with exit 2 and zero invocation requests", () => {
  const result = run(
    "route",
    "--file",
    file,
    "--model",
    "qwen/qwen2.5-0.5b-instruct",
    "--max-price-per-gflop",
    "0.01",
    "--json",
  );
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "no-eligible-miner", requests: 0 });
});
it("explains terms in a human table by default", () => {
  const result = run(
    "explain",
    "5FkMpoVojgbmpex4ENpLimrQ29pMPQK8qJZRWDHpQxYELwZ1",
    "--file",
    file,
    "--now",
    "2026-11-05T08:56:16.581Z",
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("CONTRIBUTION");
  expect(result.stdout).toContain("devnet-nominal");
  expect(result.stdout).toContain("https://mcp.flop.network/mcp");
});
it("rejects unknown commands before making a network call", () => {
  const result = run("unknown");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("flop-scoreboard snapshot|rank");
});
