// SPDX-License-Identifier: Apache-2.0
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { policyFor } from "../template/src/guards";
import { templateFiles } from "./manifest";

export { templateFiles } from "./manifest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtures = ["devnet", "models", "settlements", "offers", "leaderboard", "indexer"];
const dependencies = ["mcp", "scoreboard", "spendguard", "verifier"];

export interface GenerateOptions {
  directory: string;
  maxFlop?: string;
  workspace?: string;
}

/** Generate a new project without overwriting an existing path. Example: await generateAgent({ directory: "./my-agent" }). */
export async function generateAgent(options: GenerateOptions) {
  if (typeof options.directory !== "string" || !options.directory.trim() || options.directory.includes("\0"))
    throw new Error("A new directory is required");
  const maxFlop = options.maxFlop ?? "0.1";
  policyFor(maxFlop, "pending", "pending");
  const target = resolve(options.directory);
  const parent = await realpath(dirname(target));
  if (parent !== dirname(target)) throw new Error("Destination parent must not be a symlink path");
  try {
    await lstat(target);
    throw new Error("Destination already exists. Choose a new directory.");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  const workspace = await realpath(options.workspace ?? resolve(packageRoot, "../.."));
  const links: Record<string, string> = {};
  for (const name of dependencies) {
    const source = join(workspace, "packages", name);
    const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8")) as { name?: unknown };
    if (manifest.name !== `@flop-lab/${name}`) throw new Error(`Workspace is missing @flop-lab/${name}`);
    links[`@flop-lab/${name}`] = `link:${source}`;
  }
  const toolchain: Record<string, string> = {};
  for (const name of ["@types/node", "tsx", "typescript", "vitest"]) {
    const source = join(workspace, "node_modules", name);
    const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8")) as { name?: unknown };
    if (manifest.name !== name) throw new Error(`Install the workspace toolchain first: missing ${name}`);
    toolchain[name] = `link:${source}`;
  }
  const contents = new Map<string, string>();
  for (const [name] of templateFiles.slice(0, 8)) {
    const source = name === ".gitignore" ? "gitignore.txt" : name;
    contents.set(
      name,
      (await readFile(join(packageRoot, "template", source), "utf8")).replaceAll("__MAX_FLOP__", maxFlop),
    );
  }
  for (const name of fixtures)
    contents.set(`fixtures/${name}.json`, await readFile(join(packageRoot, "fixtures", `${name}.json`), "utf8"));
  contents.set(
    "package.json",
    JSON.stringify(
      {
        name:
          basename(target)
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .slice(0, 64) || "flop-agent",
        version: "0.0.0",
        private: true,
        type: "module",
        license: "Apache-2.0",
        engines: { node: ">=22" },
        scripts: {
          start: "tsx src/main.ts",
          check: "tsc --noEmit && vitest run",
          test: "vitest run",
          "ledger:init": "tsx src/init-ledger.ts",
        },
        dependencies: links,
        devDependencies: toolchain,
      },
      null,
      2,
    ) + "\n",
  );
  contents.set(
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2023",
          lib: ["ES2023", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          noUncheckedIndexedAccess: true,
          skipLibCheck: true,
          noEmit: true,
          esModuleInterop: true,
          resolveJsonModule: true,
          types: ["node"],
        },
        include: ["src", "test"],
      },
      null,
      2,
    ) + "\n",
  );
  contents.set("pnpm-workspace.yaml", "packages:\n  - '.'\nallowBuilds:\n  esbuild: true\n");
  // Exclusive directory creation prevents accidental replacement, including dangling symlinks.
  await mkdir(target);
  try {
    for (const [name, content] of contents) {
      await mkdir(dirname(join(target, name)), { recursive: true });
      await writeFile(join(target, name), content, { flag: "wx" });
    }
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
  return { directory: target, maxFlop, files: [...contents.keys()], networkRequests: 0 };
}
