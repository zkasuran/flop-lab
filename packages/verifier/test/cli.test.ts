// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const run = (...args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { cwd, encoding: "utf8", timeout: 10_000 });

it.each([
  ["channel-1.json", 12],
  ["v2-channel.json", 25],
] as const)("offline CLI replays %s with zero HTTP requests", (file, count) => {
  const output = run("bundle", `fixtures/${file}`, "--json");
  expect(output.status).toBe(3);
  const parsed = JSON.parse(output.stdout) as {
    requests: { requests: number };
    checks: unknown[];
    sources: { source: string; measuredAt: string }[];
  };
  expect(parsed.requests.requests).toBe(0);
  expect(parsed.checks).toHaveLength(count);
  expect(parsed.sources.length).toBeGreaterThan(0);
  expect(
    parsed.sources.every(
      (s) => s.source === "https://mcp.flop.network/mcp" && Number.isFinite(Date.parse(s.measuredAt)),
    ),
  ).toBe(true);
});

it.each([
  ["channel", "invalid", "--json"],
  ["bundle", "missing.json", "--json"],
  ["tape", "--limit", "2.5", "--json"],
  ["bundle", "fixtures/channel-1.json", "--limit", "10", "--json"],
])("rejects invalid CLI input %j", (...args) => {
  const output = run(...args);
  expect(output.status).toBe(1);
  expect((JSON.parse(output.stdout) as { exitCode: number }).exitCode).toBe(1);
});
