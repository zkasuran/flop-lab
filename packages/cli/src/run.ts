// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { commands as registry, findCommand, helpText, type Command } from "./commands";

export type Io = {
  out: (text: string) => void;
  err: (text: string) => void;
  /** Runs a script with the current Node binary and resolves with its exit code. */
  exec: (script: string, args: readonly string[]) => Promise<number>;
  /** Directory that holds the workspace packages' node_modules links. */
  packageDir: string;
};

/** Resolve the absolute path of a tool's built CLI, or explain why it is missing. */
export function resolveBin(command: Command, packageDir: string): { path: string } | { error: string } {
  const manifest = join(packageDir, "node_modules", ...command.pkg.split("/"), "package.json");
  if (!existsSync(manifest))
    return { error: `${command.pkg} is not installed. Run pnpm install at the repository root.` };
  const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { bin?: Record<string, string> };
  const relative = parsed.bin?.[command.bin];
  if (!relative) return { error: `${command.pkg} does not declare the bin ${command.bin}.` };
  const path = join(dirname(manifest), relative);
  if (!existsSync(path)) return { error: `${command.pkg} is not built. Run pnpm build at the repository root.` };
  return { path };
}

/** Run `flop` with its arguments. Resolves with the exit code. */
export async function run(argv: readonly string[], io: Io, list: readonly Command[] = registry): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === "--help" || name === "-h" || name === "help") {
    io.out(helpText(list));
    return 0;
  }
  if (name === "list") {
    io.out(
      rest.includes("--json")
        ? JSON.stringify(list, null, 2)
        : list.map((command) => `${command.name}\t${command.section}\t${command.summary}`).join("\n"),
    );
    return 0;
  }
  const command = findCommand(list, name);
  if (!command) {
    io.err(`flop: unknown command "${name}". Run flop --help for the list.`);
    return 2;
  }
  const bin = resolveBin(command, io.packageDir);
  if ("error" in bin) {
    io.err(`flop ${name}: ${bin.error}`);
    return 2;
  }
  return io.exec(bin.path, rest);
}

/** Default process wiring for the real binary. */
export function nodeIo(packageDir: string): Io {
  return {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
    exec: (script, args) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
        child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
        child.on("error", () => resolve(1));
      }),
    packageDir,
  };
}
