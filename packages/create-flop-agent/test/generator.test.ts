// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { generateAgent } from "../src/index";

const exec = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function temp() {
  const dir = await mkdtemp(join(tmpdir(), "flop-starter-"));
  dirs.push(dir);
  return dir;
}

test("generate, install, type-check and run the generated project's own offline tests", async () => {
  const dir = join(await temp(), "agent");
  const result = await generateAgent({ directory: dir });
  expect(result.networkRequests).toBe(0);
  const options = { cwd: dir, timeout: 120_000, maxBuffer: 2_000_000, env: { ...process.env, CI: "true" } };
  await exec("pnpm", ["install", "--no-frozen-lockfile", "--offline", "--reporter=append-only"], options);
  const check = await exec("pnpm", ["check"], options);
  expect(check.stdout).toContain("passed");
  const run = await exec("pnpm", ["start"], options);
  expect(run.stdout).toContain('"mode": "recorded-dry-run"');
  expect(run.stdout).toContain('"networkRequests": 0');
  const ignore = await readFile(join(dir, ".gitignore"), "utf8");
  expect(ignore).toContain("*wallet*");
  expect(ignore).toContain(".env");
  expect(result.files).not.toContain(".env");
}, 180_000);

test("refuses existing files, directories and dangling symlinks without overwriting", async () => {
  const root = await temp();
  const file = join(root, "keep");
  await writeFile(file, "user data");
  const link = join(root, "link");
  await symlink(join(root, "missing"), link);
  for (const directory of [root, file, link])
    await expect(generateAgent({ directory })).rejects.toThrow("already exists");
  expect(await readFile(file, "utf8")).toBe("user data");
});

test.each(["", "0", "1.01", "-0.1", "1e-1"])("rejects bad ceiling %s before creating files", async (maxFlop) => {
  await expect(generateAgent({ directory: join(await temp(), "agent"), maxFlop })).rejects.toThrow();
});
