// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { diagnose, evaluate, overall, type Report } from "../src/index.js";
import { command, bindPort } from "../src/probes.js";

const save = async (name: string, value: unknown) =>
  writeFile(new URL(`../test/fixtures/${name}.json`, import.meta.url), JSON.stringify(value, null, 2) + "\n");
const probes: Record<string, unknown> = {};
for (const [name, file, args] of [
  ["gpu", "nvidia-smi", ["--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"]],
  ["disk", "df", ["-B1", "--output=size,avail", "--", "."]],
  ["cpu", "nproc", []],
  ["docker", "docker", ["version", "--format", "{{.Server.Version}}"]],
  ["compose", "docker", ["compose", "version", "--short"]],
] as const) {
  const measuredAt = new Date().toISOString();
  try {
    probes[name] = { source: `${file} ${args.join(" ")}`, measuredAt, raw: await command(file, [...args]) };
  } catch (error) {
    probes[name] = {
      source: `${file} ${args.join(" ")}`,
      measuredAt,
      raw: null,
      code: error && typeof error === "object" && "code" in error ? error.code : "unavailable",
      note: "stderr omitted to avoid disclosing host details",
    };
  }
}
const report = await diagnose({ role: "miner", skipPorts: true });
probes.memory = {
  ...report.inventory.memory,
  raw: (await readFile("/proc/meminfo", "utf8"))
    .split("\n")
    .filter((line) => /^MemTotal:|^MemAvailable:/.test(line))
    .join("\n"),
  note: "Only MemTotal and MemAvailable retained; unrelated meminfo fields omitted",
};
probes.clock = report.inventory.clocks;
probes.binding = {
  source: "transient loopback TCP 3429",
  measuredAt: new Date().toISOString(),
  value: await bindPort(3429),
};
await save("host-probes", probes);
await save("example-miner", report);
const validatorInventory = { ...report.inventory, ports: [], images: {} };
const requirements = evaluate("validator", validatorInventory);
const validator: Report = {
  ...report,
  role: "validator",
  inventory: validatorInventory,
  requirements,
  status: overall(requirements.map((r) => r.status)),
};
// Re-evaluation shares hardware observations. No claim that validator-specific ports or images were probed.
await save("example-validator", validator);
const source = "https://api.flop.network/v1/models";
const response = await fetch(source, {
  signal: AbortSignal.timeout(15000),
  headers: { "user-agent": "flop-lab-doctor/0.1 fixture recorder" },
});
const raw = await response.text();
if (!response.ok || raw.length > 65536) throw new Error("Cannot record model catalogue");
await save("models", { source, measuredAt: new Date().toISOString(), status: response.status, raw });
console.log(
  JSON.stringify({
    measuredAt: report.measuredAt,
    status: report.status,
    durationMs: report.durationMs,
    requests: report.requests,
    counts: Object.fromEntries(
      ["READY", "NOT_READY", "UNKNOWN"].map((s) => [s, report.requirements.filter((r) => r.status === s).length]),
    ),
  }),
);
