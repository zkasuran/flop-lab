// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const path = "src/policy.ts";
const original = await readFile(path, "utf8");
const needle = "rules.push({ rule, passed, detail })";
if (!original.includes(needle)) throw new Error("Mutation injection point not found");
const run = () => spawnSync("pnpm", ["exec", "vitest", "run", "test/policy.test.ts"], { encoding: "utf8" });
const baseline = run();
console.log("BASELINE", baseline.status, baseline.stdout, baseline.stderr);
if (baseline.status !== 0) throw new Error("Baseline failed");
try {
  for (const rule of [
    "uniqueId",
    "clock",
    "budget.task",
    "budget.hour",
    "budget.day",
    "budget.total",
    "maxPricePerGflop",
    "maxEscrowPerSession",
    "allowModels",
    "allowMiners",
    "denyMiners",
    "modelCap",
    "minerCap",
    "requireDryRun",
    "cooldown",
  ]) {
    await writeFile(
      path,
      original.replace(
        needle,
        `rules.push({ rule, passed: rule === ${JSON.stringify(rule)} ? true : passed, detail })`,
      ),
    );
    const mutant = run();
    console.log(`MUTANT ${rule}: exit=${mutant.status}`, mutant.stdout, mutant.stderr);
    if (mutant.status === 0 || mutant.status === null) throw new Error(`Surviving mutant: ${rule}`);
  }
} finally {
  await writeFile(path, original);
}
const restored = run();
console.log("RESTORED", restored.status, restored.stdout, restored.stderr);
if (restored.status !== 0) throw new Error("Restored tests failed");
