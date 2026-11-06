// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateAgent } from "../src/index";

const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "flop-starter-evidence-"));
const dir = join(root, "agent");
const log: string[] = [`Measured at ${new Date().toISOString()}`, `Node ${process.version}`, `Source ${process.cwd()}`];
const output = process.argv[2];
if (!output) throw new Error("Pass an evidence log path");
const command = async (args: string[]) => {
  try {
    const result = await exec("pnpm", args, { cwd: dir, timeout: 120_000, maxBuffer: 2_000_000 });
    log.push(`pnpm ${args.join(" ")}`, result.stdout, result.stderr, "exit 0");
    return 0;
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string; code?: number };
    log.push(`pnpm ${args.join(" ")}`, result.stdout ?? "", result.stderr ?? "", `exit ${result.code}`);
    return result.code ?? 1;
  }
};
try {
  const start = performance.now();
  const generated = await generateAgent({ directory: dir });
  log.push(
    JSON.stringify({
      generationMs: performance.now() - start,
      files: generated.files.length,
      networkRequests: generated.networkRequests,
    }),
  );
  if (await command(["install", "--no-frozen-lockfile", "--offline", "--reporter=append-only"]))
    throw new Error("Install failed");
  if (await command(["check"])) throw new Error("Baseline failed");
  if (await command(["start"])) throw new Error("Dry run failed");
  const agentPath = join(dir, "src/agent.ts");
  const original = await readFile(agentPath, "utf8");
  const mutant = original.replace(
    "assertDevnet(health.value, health.measuredAt, now());",
    "// Mutation: initial devnet guard removed.",
  );
  if (mutant === original) throw new Error("Mutation did not apply");
  await writeFile(agentPath, mutant);
  log.push("RED: removed the devnet guard before discovery");
  if ((await command(["test"])) === 0) throw new Error("Mutation survived");
  await writeFile(agentPath, original);
  log.push("GREEN: restored devnet guard");
  if (await command(["check"])) throw new Error("Restored checks failed");
  console.log("Generated project install, dry run and devnet guard mutation verified.");
} finally {
  await writeFile(output, log.join("\n") + "\n");
  await rm(root, { recursive: true, force: true });
}
