// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { commands, helpText, resolveBin, run, type Command, type Io } from "../src/index";

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = join(here, "..");
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
  const pkg = join(dir, "node_modules", "@flop-lab", "demo");
  mkdirSync(join(pkg, "dist"), { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ bin: { "flop-demo": "./dist/cli.js" } }));
  if (built) writeFileSync(join(pkg, "dist", "cli.js"), "");
  return dir;
}

describe("registry", () => {
  it("has unique names and every entry matches its workspace package bin", () => {
    expect(new Set(commands.map((c) => c.name)).size).toBe(commands.length);
    const pkgJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    for (const command of commands) {
      expect(pkgJson.dependencies[command.pkg]).toBe("workspace:*");
      const target = JSON.parse(
        readFileSync(join(packageDir, "..", command.pkg.replace("@flop-lab/", ""), "package.json"), "utf8"),
      ) as { name: string; bin: Record<string, string> };
      if (target.name !== command.pkg) throw new Error(`${command.pkg} folder mismatch`);
      expect(Object.keys(target.bin)).toContain(command.bin);
    }
  });
  it("groups help by section and lists every command", () => {
    const text = helpText(commands);
    for (const command of commands) expect(text).toContain(command.name);
    expect(text.indexOf("verify\n")).toBeLessThan(text.indexOf("agents\n"));
  });
});

describe("dispatch", () => {
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
});
