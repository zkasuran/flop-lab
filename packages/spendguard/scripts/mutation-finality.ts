// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const path = "src/sdk.ts",
  original = await readFile(path, "utf8");
const needle = "block.number > head.number ||";
if (!original.includes(needle)) throw new Error("Finality mutation point missing");
const run = () => spawnSync("pnpm", ["exec", "vitest", "run", "test/sdk.test.ts"], { encoding: "utf8" });
try {
  await writeFile(path, original.replace(needle, "false ||"));
  const red = run();
  console.log("UNFINALIZED BLOCK MUTANT", red.status, red.stdout, red.stderr);
  if (red.status === 0 || red.status === null) throw new Error("Finality mutant survived");
} finally {
  await writeFile(path, original);
}
const green = run();
console.log("RESTORED", green.status, green.stdout, green.stderr);
if (green.status !== 0) throw new Error("Restored finality tests failed");
