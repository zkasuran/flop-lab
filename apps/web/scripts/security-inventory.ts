// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Inspect installed package manifests only. No lifecycle script is executed.
const root = resolve(import.meta.dirname, "../../..");
type Manifest = {
  name: string;
  version: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const installed = new Map<string, { name: string; version: string; scripts: Record<string, string> }>();
const read = async (directory: string): Promise<Manifest> =>
  JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as Manifest;
const store = join(root, "node_modules/.pnpm");
for (const entry of await readdir(store, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === "node_modules") continue;
  const modules = join(store, entry.name, "node_modules");
  for (const folder of await readdir(modules, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const directories = folder.name.startsWith("@")
      ? (await readdir(join(modules, folder.name), { withFileTypes: true }))
          .filter((child) => child.isDirectory())
          .map((child) => join(modules, folder.name, child.name))
      : [join(modules, folder.name)];
    for (const directory of directories) {
      const pkg = await read(directory);
      const scripts = Object.fromEntries(
        Object.entries(pkg.scripts ?? {}).filter(([key]) =>
          ["preinstall", "install", "postinstall", "prepare"].includes(key),
        ),
      );
      if (Object.keys(scripts).length)
        installed.set(`${pkg.name}@${pkg.version}`, { name: pkg.name, version: pkg.version, scripts });
    }
  }
}
const web = await read(join(root, "apps/web"));
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      source: "Installed node_modules/.pnpm package manifests and apps/web/package.json",
      commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      web: { dependencies: web.dependencies, devDependencies: web.devDependencies },
      lifecyclePackages: [...installed.values()].sort(
        (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
      ),
    },
    null,
    2,
  ),
);
