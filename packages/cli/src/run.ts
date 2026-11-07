// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { constants } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { commands as registry, findCommand, helpText, type Command } from "./commands";
import { completionScript } from "./completions";
import { searchCommands } from "./search";
import { toolArguments } from "./arguments";

export type Io = {
  out: (text: string) => void;
  err: (text: string) => void;
  /** Runs a script with the current Node binary and resolves with its exit code. */
  exec: (script: string, args: readonly string[]) => Promise<number>;
  /** Directory that holds the workspace packages' node_modules links. */
  packageDir: string;
};

/** Resolve a built CLI or explain the installation error. Example: resolveBin(commands[0], process.cwd()). */
export function resolveBin(command: Command, packageDir: string): { path: string } | { error: string } {
  const manifest = join(packageDir, "node_modules", ...command.pkg.split("/"), "package.json");
  if (!existsSync(manifest))
    return { error: `${command.pkg} is not installed. Run pnpm install at the repository root.` };
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
    const bin: unknown = isRecord(parsed) ? parsed.bin : undefined;
    const entry = isRecord(bin) ? bin[command.bin] : undefined;
    if (typeof entry !== "string" || !entry)
      return { error: `${command.pkg} does not declare the bin ${command.bin}.` };
    const path = resolve(dirname(manifest), entry);
    const within = relative(dirname(manifest), path);
    if (isAbsolute(entry) || within.startsWith("..") || isAbsolute(within))
      return { error: `${command.pkg} declares a bin outside its package.` };
    if (!existsSync(path)) return { error: `${command.pkg} is not built. Run pnpm build at the repository root.` };
    if (!statSync(path).isFile()) return { error: `${command.pkg} bin is not a file.` };
    // Node resolves ESM symlinks. Match argv[1] to import.meta.url for entry-point guards.
    return { path: realpathSync(path) };
  } catch {
    return { error: `${command.pkg} has an unreadable or invalid package manifest.` };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const usage: Record<string, string> = {
  list: "flop list [--json]",
  which: "flop which <words> [--json]\nSearch names, summaries and question taglines. Exit 1 means no match.",
  completions: "flop completions <bash|zsh|fish>\nPrint a script to load in your shell. No files are written.",
  help: "flop help [command]",
};

/** Run arguments and return the child or suite exit code. Example: await run(["list", "--json"], io). */
export async function run(argv: readonly string[], io: Io, list: readonly Command[] = registry): Promise<number> {
  let [name, ...rest] = argv;
  const invalid = (message: string) => {
    io.err(`flop: ${message}`);
    return 2;
  };
  if (!name || ((name === "--help" || name === "-h" || name === "help") && rest.length === 0)) {
    io.out(helpText(list));
    return 0;
  }
  if (name === "help") {
    if (rest.length !== 1) return invalid(usage.help!);
    name = rest[0]!;
    rest = ["--help"];
  }
  if (Object.hasOwn(usage, name) && rest.length === 1 && ["--help", "-h"].includes(rest[0]!)) {
    io.out(usage[name]!);
    return 0;
  }
  if (name === "list") {
    if (rest.length > 1 || rest.some((arg) => arg !== "--json")) return invalid(usage.list!);
    io.out(
      rest.includes("--json")
        ? JSON.stringify(list, null, 2)
        : list.map((command) => `${command.name}\t${command.section}\t${command.summary}`).join("\n"),
    );
    return 0;
  }
  if (name === "which") {
    const terms: string[] = [];
    let json = false;
    let literal = false;
    for (const arg of rest) {
      if (!literal && arg === "--") literal = true;
      else if (!literal && arg === "--json" && !json) json = true;
      else if (!literal && arg.startsWith("-")) return invalid(usage.which!);
      else terms.push(arg);
    }
    if (!terms.join(" ").trim()) return invalid(usage.which!);
    const matches = searchCommands(list, terms.join(" "));
    io.out(
      json
        ? JSON.stringify(matches, null, 2)
        : matches.length
          ? matches
              .map(
                ({ command, matched }) =>
                  `flop ${command.name} [${command.section}]\n  ${command.tagline ?? command.summary}\n  ${command.summary}\n  Matched: ${matched.join(", ")}\n  Options: flop help ${command.name}`,
              )
              .join("\n\n")
          : "No matching tool. Try a concrete term such as settlement, miner or budget.",
    );
    return matches.length ? 0 : 1;
  }
  if (name === "completions") {
    const [shell] = rest;
    if (rest.length !== 1 || (shell !== "bash" && shell !== "zsh" && shell !== "fish"))
      return invalid(usage.completions!);
    io.out(completionScript(list, shell));
    return 0;
  }
  const command = findCommand(list, name);
  if (!command) {
    return invalid(`unknown command ${JSON.stringify(name)}. Run flop --help or flop which <words>.`);
  }
  const bin = resolveBin(command, io.packageDir);
  if ("error" in bin) {
    io.err(`flop ${name}: ${bin.error}`);
    return 2;
  }
  return io.exec(bin.path, toolArguments(command, rest));
}

/** Wire a child to the caller's streams. Example: nodeIo(packageDir). */
export function nodeIo(packageDir: string): Io {
  return {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
    exec: (script, args) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
        const interrupt = () => child.kill("SIGINT");
        const terminate = () => child.kill("SIGTERM");
        process.on("SIGINT", interrupt);
        process.on("SIGTERM", terminate);
        const finish = (code: number) => {
          process.off("SIGINT", interrupt);
          process.off("SIGTERM", terminate);
          resolve(code);
        };
        child.once("exit", (code, signal) => finish(code ?? (signal ? 128 + constants.signals[signal] : 1)));
        child.once("error", (error) => {
          process.stderr.write(`flop: could not start tool: ${error.message}\n`);
          finish(2);
        });
      }),
    packageDir,
  };
}
