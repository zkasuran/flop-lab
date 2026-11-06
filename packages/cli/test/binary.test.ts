// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { commands, completionScript, type Shell } from "../src/index";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = join(root, "packages/cli/dist/cli.js");
const offline = join(root, "packages/cli/scripts/offline.cjs");
const env = { ...process.env, NO_COLOR: "1", NODE_OPTIONS: `--require=${offline}` };

beforeAll(() => {
  // The repository gate runs check before build. Always test fresh built bytes.
  execFileSync("pnpm", ["--filter", "@flop-lab/cli...", "--workspace-concurrency=1", "run", "build"], {
    cwd: root,
    timeout: 120_000,
    stdio: "pipe",
  });
}, 130_000);

function invoke(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, env, encoding: "utf8", timeout: 10_000 });
}

describe("built suite", () => {
  it("matches the help golden", async () => {
    const result = invoke(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    await expect(result.stdout).toMatchFileSnapshot("./fixtures/help.txt");
  });
  it.each(commands)("runs $name --help and help $name offline", ({ name, bin }) => {
    const direct = invoke([name, "--help"]);
    const alias = invoke(["help", name]);
    expect(direct.error).toBeUndefined();
    expect(direct.status, direct.stderr).toBe(0);
    expect(direct.stdout.length + direct.stderr.length).toBeGreaterThan(0);
    const text = direct.stdout + direct.stderr;
    expect(text.includes(bin) || text.includes(`flop ${name}`)).toBe(true);
    expect(alias.status).toBe(direct.status);
    expect(alias.stdout).toBe(direct.stdout);
    expect(alias.stderr).toBe(direct.stderr);
  });
  it("prints machine-readable discovery and no-match results", () => {
    expect(JSON.parse(invoke(["list", "--json"]).stdout)).toEqual(commands);
    const result = invoke(["which", "miner reliability", "--json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)[0].command.name).toBe("score");
    const empty = invoke(["which", "unmatchedzz", "--json"]);
    expect(empty.status).toBe(1);
    expect(JSON.parse(empty.stdout)).toEqual([]);
  });
  it("preserves sourced recorded results and a finding exit code", () => {
    const scored = invoke([
      "score",
      "rank",
      "--file",
      join(root, "packages/scoreboard/fixtures/snapshot-04.json"),
      "--json",
    ]);
    expect(scored.status).toBe(0);
    const rank = JSON.parse(scored.stdout);
    expect(rank.requests).toBe(0);
    expect(rank.measuredAt).toBe("2026-11-05T22:49:04.652Z");
    expect(rank.result.length).toBeGreaterThan(0);
    const audit = invoke([
      "indexer",
      "run",
      "--snapshot",
      join(root, "packages/indexer-audit/fixtures/devnet.json"),
      "--json",
    ]);
    expect(audit.status).toBe(1);
    expect(JSON.parse(audit.stdout).counts.FAIL).toBeGreaterThan(0);
  });
  it.each([
    ["swap", "observe", "--recorded", "--json"],
    ["guard", "lint", join(root, "packages/spendguard/examples/policy.json"), "--json"],
    ["harness", "list", "--json"],
    ["x402", "inspect", join(root, "packages/x402kit/fixtures/headers.json"), "--json"],
  ])("accepts JSON-native operation %j", (...args) => {
    const result = invoke(args);
    expect(result.status, result.stderr).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stderr).toBe("");
  });
});

describe("generated completions", () => {
  for (const shell of ["bash", "zsh", "fish"] satisfies Shell[]) {
    const available = !spawnSync(shell, ["--version"], { encoding: "utf8" }).error;
    it.skipIf(!available)(`${shell} parses its script`, () => {
      const script = invoke(["completions", shell]);
      expect(script.status).toBe(0);
      const parsed = spawnSync(shell, ["-n"], { input: script.stdout, encoding: "utf8" });
      expect(parsed.status, parsed.stderr).toBe(0);
    });
  }
  it("bash completes command prefixes and help targets from the registry", () => {
    const script = completionScript(commands, "bash");
    const result = spawnSync("bash", ["--noprofile", "--norc"], {
      input:
        script +
        '\nCOMP_WORDS=(flop ver); COMP_CWORD=1; _flop_complete; printf "%s\\n" "${COMPREPLY[@]}"\nCOMP_WORDS=(flop help sco); COMP_CWORD=2; _flop_complete; printf "%s\\n" "${COMPREPLY[@]}"',
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("verify\nscore\n");
  });
  it("refuses shell syntax in a command name", () => {
    expect(() => completionScript([{ ...commands[0]!, name: "bad;command" }], "bash")).toThrow("Invalid completion");
  });
});
