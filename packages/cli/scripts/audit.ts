// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commands } from "../src/commands";
import { jsonProbes } from "./probes";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const destination = process.argv[2];
if (!destination) throw new Error("Usage: pnpm exec tsx packages/cli/scripts/audit.ts OUTPUT_DIRECTORY");
mkdirSync(destination, { recursive: true });
const cwd = mkdtempSync(join(tmpdir(), "flop-cli-audit-"));
const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
const observedAt = new Date().toISOString();
const binarySha256 = createHash("sha256")
  .update(readFileSync(join(root, "packages/cli/dist/cli.js")))
  .digest("hex");
const probesByName = jsonProbes(root, cwd);
writeFileSync(join(cwd, "empty.json"), "{}\n");
const example = spawnSync(process.execPath, [join(root, "packages/cli/dist/cli.js"), "watch", "example"], {
  encoding: "utf8",
});
if (example.status !== 0) throw new Error("watch example failed");
writeFileSync(join(cwd, "watch.yaml"), example.stdout);

function capture(text: string, name: string) {
  const bytes = Buffer.from(text);
  const files: string[] = [];
  for (let i = 0; i < bytes.length; i += 100_000) {
    const filename = `${name}.${files.length}.txt`;
    writeFileSync(join(destination!, filename), bytes.subarray(i, i + 100_000));
    files.push(filename);
  }
  return {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    files,
    preview: text.slice(0, 1200),
  };
}
const rows = [];
try {
  for (const command of commands) {
    const probes = [];
    for (const args of [["--help"], ["--json"], ["--cli-audit-invalid"], probesByName[command.name] ?? ["--json"]]) {
      const start = performance.now();
      const child = spawnSync(process.execPath, [join(root, "packages/cli/dist/cli.js"), command.name, ...args], {
        cwd,
        encoding: "utf8",
        timeout: 15_000,
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          NODE_OPTIONS: `--require=${join(root, "packages/cli/scripts/offline.cjs")}`,
          NO_COLOR: "1",
        },
      });
      let json = false;
      try {
        JSON.parse(child.stdout);
        json = true;
      } catch {
        // A text response or empty stdout is not a JSON result.
      }
      probes.push({
        args,
        exit: child.status,
        signal: child.signal,
        durationMs: Math.round(performance.now() - start),
        json,
        stdout: capture(child.stdout, `${command.name}-${probes.length}-stdout`),
        stderr: capture(child.stderr, `${command.name}-${probes.length}-stderr`),
        error: child.error?.message,
      });
    }
    const record = { observedAt, source: `git:${revision}`, binarySha256, node: process.version, command, probes };
    writeFileSync(join(destination, `${command.name}.json`), JSON.stringify(record, null, 2) + "\n");
    const row = {
      name: command.name,
      helpExit: probes[0]?.exit,
      jsonExit: probes[1]?.exit,
      json: probes[1]?.json,
      invalidExit: probes[2]?.exit,
      exampleExit: probes[3]?.exit,
      exampleJson: probes[3]?.json,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  writeFileSync(join(destination, "summary.json"), JSON.stringify({ observedAt, revision, rows }, null, 2) + "\n");
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
