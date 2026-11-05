// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const output = process.argv[2];
if (!output) throw new Error("Pass an evidence log path");
const source = new URL("../src/compare.ts", import.meta.url);
const original = await readFile(source, "utf8");
const target = "a.value === b.value && a.unit === b.unit";
if (original.split(target).length !== 2) throw new Error("Mutation target is not unique");
const run = () =>
  spawnSync("pnpm", ["exec", "vitest", "run", "test/spec.test.ts"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
let red: ReturnType<typeof run>;
try {
  await writeFile(source, original.replace(target, "a.value !== b.value && a.unit === b.unit"));
  red = run();
} finally {
  await writeFile(source, original);
}
const green = run();
await writeFile(
  output,
  `Mutation: equality inverted in parameter comparison\nMeasured at ${new Date().toISOString()}\nRED exit=${red.status}\n${red.stdout}${red.stderr}\nGREEN exit=${green.status}\n${green.stdout}${green.stderr}`,
);
if (red.status === 0 || green.status !== 0) throw new Error("Mutation was not caught or restoration failed");
console.log(`Mutation caught (exit ${red.status}); restored suite passed (exit ${green.status}). Evidence: ${output}`);
