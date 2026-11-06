// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { commands, helpText, resolveBin, run, searchCommands, type Command, type Io } from "../src/index";
import { builtins } from "../src/completions";
import { nativeJsonOperations, toolArguments } from "../src/arguments";
import { nodeIo } from "../src/run";
import { tools } from "../../../apps/web/content/tools";

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = join(here, "..");
const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const fake: Command = {
  name: "demo",
  pkg: "@flop-lab/demo",
  bin: "flop-demo",
  section: "verify",
  summary: "Demo tool",
};

function io(dir: string) {
  const calls: { script: string; args: readonly string[] }[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const value: Io = {
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    exec: async (script, args) => {
      calls.push({ script, args });
      return 7;
    },
    packageDir: dir,
  };
  return { value, calls, out, err };
}

function fakeInstall(built: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "flop-cli-"));
  temporary.push(dir);
  const pkg = join(dir, "node_modules", "@flop-lab", "demo");
  mkdirSync(join(pkg, "dist"), { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ bin: { "flop-demo": "./dist/cli.js" } }));
  if (built) writeFileSync(join(pkg, "dist", "cli.js"), "");
  return dir;
}

describe("registry", () => {
  it("has unique names and every entry matches its workspace package bin", () => {
    expect(new Set(commands.map((c) => c.name)).size).toBe(commands.length);
    expect(new Set(commands.map((c) => c.bin)).size).toBe(commands.length);
    const pkgJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    for (const command of commands) {
      expect(builtins).not.toContain(command.name);
      expect(command.name).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(command.summary.trim()).not.toBe("");
      const tool = tools.find((tool) => tool.repoPath === `packages/${command.pkg.replace("@flop-lab/", "")}`);
      expect(tool?.section, command.name).toBe(command.section);
      expect(command.tagline, command.name).toBeTruthy();
      expect(pkgJson.dependencies[command.pkg]).toBe("workspace:*");
      const target = JSON.parse(
        readFileSync(join(packageDir, "..", command.pkg.replace("@flop-lab/", ""), "package.json"), "utf8"),
      ) as { name: string; bin: Record<string, string> };
      if (target.name !== command.pkg) throw new Error(`${command.pkg} folder mismatch`);
      expect(Object.keys(target.bin)).toContain(command.bin);
    }
  });
  it("covers every package bin, not just entries already in the registry", () => {
    for (const folder of readdirSync(join(packageDir, ".."))) {
      const manifest = join(packageDir, "..", folder, "package.json");
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, "utf8")) as { name: string; bin?: Record<string, string> | string };
      if (!pkg.bin || pkg.name === "@flop-lab/cli") continue;
      const bins = typeof pkg.bin === "string" ? [pkg.name.split("/").at(-1)] : Object.keys(pkg.bin);
      for (const bin of bins)
        expect(
          commands.filter((c) => c.pkg === pkg.name && c.bin === bin),
          `${pkg.name}:${bin}`,
        ).toHaveLength(1);
    }
  });
  it("groups help by section and lists every command", () => {
    const text = helpText(commands);
    for (const command of commands) expect(text).toContain(command.name);
    expect(text.indexOf("verify\n")).toBeLessThan(text.indexOf("agents\n"));
  });
});

describe("dispatch", () => {
  it.each([
    ["process.exit(3)", 3],
    ["process.kill(process.pid, 'SIGTERM')", 143],
  ])("preserves child exit and signal status for %s", async (source, exit) => {
    const dir = fakeInstall(true);
    const path = join(dir, "node_modules/@flop-lab/demo/dist/cli.js");
    writeFileSync(path, source);
    const before = process.listenerCount("SIGTERM");
    expect(await nodeIo(dir).exec(path, [])).toBe(exit);
    expect(process.listenerCount("SIGTERM")).toBe(before);
  });
  it("passes arguments through and returns the tool's exit code", async () => {
    const dir = fakeInstall(true);
    const t = io(dir);
    expect(await run(["demo", "tape", "--json"], t.value, [fake])).toBe(7);
    expect(t.calls).toEqual([
      { script: join(dir, "node_modules", "@flop-lab", "demo", "dist", "cli.js"), args: ["tape", "--json"] },
    ]);
  });
  it("refuses an unknown command with exit 2 and runs nothing", async () => {
    const t = io(fakeInstall(true));
    expect(await run(["nope"], t.value, [fake])).toBe(2);
    expect(t.calls).toHaveLength(0);
    expect(t.err.join("")).toContain("unknown command");
  });
  it("explains a missing build instead of crashing", async () => {
    const dir = fakeInstall(false);
    expect(resolveBin(fake, dir)).toEqual({
      error: "@flop-lab/demo is not built. Run pnpm build at the repository root.",
    });
    const t = io(dir);
    expect(await run(["demo"], t.value, [fake])).toBe(2);
    expect(t.calls).toHaveLength(0);
  });
  it("prints help and JSON list without running a tool", async () => {
    const t = io(fakeInstall(true));
    expect(await run([], t.value, [fake])).toBe(0);
    expect(await run(["list", "--json"], t.value, [fake])).toBe(0);
    expect(JSON.parse(t.out[1] ?? "[]")).toEqual([fake]);
    expect(t.calls).toHaveLength(0);
  });
  it("routes help to the requested tool with only --help", async () => {
    const t = io(fakeInstall(true));
    expect(await run(["help", "demo"], t.value, [fake])).toBe(7);
    expect(t.calls[0]?.args).toEqual(["--help"]);
  });
  it.each([
    ["help", "demo", "extra"],
    ["help", "missing"],
    ["--help", "extra"],
    ["list", "--wat"],
    ["list", "--json", "--json"],
    ["which"],
    ["which", "--json"],
    ["which", "--wat"],
    ["completions", "pwsh"],
    ["completions", "bash", "extra"],
  ])("rejects malformed suite arguments %j", async (...args) => {
    const t = io(fakeInstall(true));
    expect(await run(args, t.value, [fake])).toBe(2);
    expect(t.calls).toHaveLength(0);
    expect(t.out).toHaveLength(0);
  });
  it("keeps empty search JSON parseable with exit 1", async () => {
    const t = io(fakeInstall(true));
    expect(await run(["which", "unmatched", "--json"], t.value, [fake])).toBe(1);
    expect(JSON.parse(t.out[0]!)).toEqual([]);
    expect(t.err).toEqual([]);
  });
  it.each(["null", "[1]", "{", '{"bin":{"flop-demo":42}}', '{"bin":{"flop-demo":"../../outside.js"}}'])(
    "explains malformed manifests %s",
    (manifest) => {
      const dir = fakeInstall(true);
      writeFileSync(join(dir, "node_modules/@flop-lab/demo/package.json"), manifest);
      expect(resolveBin(fake, dir)).toHaveProperty("error");
    },
  );
});

describe("question search", () => {
  it("ranks both query terms above partial matches and ignores case and question words", () => {
    const matches = searchCommands(commands, "Which miner has RELIABILITY?");
    expect(matches[0]?.command.name).toBe("score");
    expect(matches[0]?.matched).toEqual(["miner", "reliability"]);
    expect(searchCommands(commands, "machine ready")[0]?.command.name).toBe("doctor");
    expect(searchCommands(commands, "budget")[0]?.command.name).toBe("guard");
  });
  it("uses stable tie ordering and never changes the registry", () => {
    const list = [
      { ...fake, name: "zeta" },
      { ...fake, name: "alpha" },
    ];
    expect(searchCommands(list, "demo").map((m) => m.command.name)).toEqual(["alpha", "zeta"]);
    expect(list[0]?.name).toBe("zeta");
  });
  it("handles punctuation, empty, duplicate and hostile input as text", () => {
    expect(searchCommands([], "budget")).toEqual([]);
    expect(searchCommands(commands, "which tool?")).toEqual([]);
    expect(searchCommands(commands, "$(touch /tmp/nope);\u001b[31m")).toEqual([]);
    expect(searchCommands(commands, "budget budget")[0]?.matched).toEqual(["budget"]);
    expect(searchCommands(commands, "spec")[0]?.command.name).toBe("spec");
  });
});

describe("JSON-native adapters", () => {
  it("consumes only a trailing single --json on registered operations", () => {
    for (const [pkg, operations] of Object.entries(nativeJsonOperations)) {
      const command = commands.find((command) => command.pkg === pkg)!;
      expect(command).toBeDefined();
      for (const operation of operations) {
        expect(toolArguments(command, [operation, "input", "--json"])).toEqual([operation, "input"]);
        expect(toolArguments(command, [operation, "--", "--json"])).toEqual([operation, "--", "--json"]);
        expect(toolArguments(command, [operation, "--json", "--json"])).toEqual([operation, "--json", "--json"]);
      }
      expect(toolArguments(command, ["--help", "--json"])).toEqual(["--help", "--json"]);
      expect(toolArguments(command, ["unknown", "--json"])).toEqual(["unknown", "--json"]);
    }
    expect(toolArguments(fake, ["lint", "--json"])).toEqual(["lint", "--json"]);
  });
});
