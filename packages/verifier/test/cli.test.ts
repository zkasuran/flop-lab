// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const run = (...args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { cwd, encoding: "utf8", timeout: 10_000 });

it("offline CLI reports uncertainty with zero HTTP requests", () => {
  const output = run("bundle", "fixtures/channel-1.json", "--json");
  expect(output.status).toBe(3);
  const parsed = JSON.parse(output.stdout) as { requests: { requests: number }; checks: unknown[] };
  expect(parsed.requests.requests).toBe(0);
  expect(parsed.checks).toHaveLength(12);
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
