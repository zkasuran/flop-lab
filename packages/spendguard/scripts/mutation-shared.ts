// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const cases = [
  {
    path: "src/shared.ts",
    needle: "evaluate(this.policy, state.reservations, request)",
    replacement: "evaluate(this.policy, [], request)",
    test: "test/shared.test.ts",
    name: "ignore shared reservations",
  },
  {
    path: "src/shared.ts",
    needle: "binding.fingerprint !== this.fingerprint",
    replacement: "false",
    test: "test/shared.test.ts",
    name: "ignore pinned policy",
  },
  {
    path: "src/lint.ts",
    needle: "parseFlop(value) > parseFlop(cap)",
    replacement: "false",
    test: "test/lint.test.ts",
    name: "ignore documented caps",
  },
  {
    path: "src/replay.ts",
    needle: 'decision.decision === "allow"',
    replacement: 'decision.decision === "deny"',
    test: "test/replay.test.ts",
    name: "reverse replay admission",
  },
];
for (const mutation of cases) {
  const original = await readFile(mutation.path, "utf8");
  if (!original.includes(mutation.needle)) throw new Error(`Missing mutation point: ${mutation.name}`);
  const run = () => spawnSync("pnpm", ["exec", "vitest", "run", mutation.test], { encoding: "utf8" });
  const baseline = run();
  console.log("BASELINE", mutation.name, baseline.status, baseline.stdout, baseline.stderr);
  if (baseline.status !== 0) throw new Error("Baseline failed");
  try {
    await writeFile(mutation.path, original.replace(mutation.needle, mutation.replacement));
    const red = run();
    console.log("MUTANT", mutation.name, red.status, red.stdout, red.stderr);
    if (red.status === 0 || red.status === null) throw new Error(`Surviving mutant: ${mutation.name}`);
  } finally {
    await writeFile(mutation.path, original);
  }
  const green = run();
  console.log("RESTORED", mutation.name, green.status, green.stdout, green.stderr);
  if (green.status !== 0) throw new Error("Restored tests failed");
}
