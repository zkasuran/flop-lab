// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { evaluate, overall, type Report } from "../src/index.js";

// Re-evaluate saved observations without claiming a new measurement.
for (const role of ["miner", "validator"] as const) {
  const url = new URL(`../test/fixtures/example-${role}.json`, import.meta.url);
  const report = JSON.parse(await readFile(url, "utf8")) as Report;
  if (role === "validator") report.inventory = { ...report.inventory, images: {}, ports: [] };
  report.requirements = evaluate(role, report.inventory);
  report.status = overall(report.requirements.map((row) => row.status));
  await writeFile(url, JSON.stringify(report, null, 2) + "\n");
}
