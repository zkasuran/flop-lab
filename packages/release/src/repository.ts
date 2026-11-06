// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  copyFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseChange, planVersions, renderChangelog, type PackageVersion, type PlannedVersion } from "./index";

type Manifest = Record<string, unknown> & { name: string; version: string };
export interface ReleasePlan {
  format: 1;
  mode: "dry-run";
  source: string;
  commit: string;
  measuredAt: string;
  changes: { id: string; sha256: string }[];
  packages: PlannedVersion[];
}
interface PackageInfo extends PackageVersion {
  directory: string;
  manifest: Manifest;
}
const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"] as const;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected JSON object");
  return value as Record<string, unknown>;
}
function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}
function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}
function discover(root: string): PackageInfo[] {
  return readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const directory = `packages/${d.name}`;
      const path = join(root, directory, "package.json");
      if (!existsSync(path)) return [];
      const manifest = object(JSON.parse(readFileSync(path, "utf8")));
      if (typeof manifest.name !== "string" || typeof manifest.version !== "string")
        throw new Error(`Missing package version: ${directory}`);
      const dependencies: string[] = [];
      for (const field of dependencyFields) {
        for (const [name, range] of Object.entries(object(manifest[field] ?? {}))) {
          if (typeof range !== "string") throw new Error(`Invalid dependency: ${name}`);
          if (range.startsWith("workspace:") && !["workspace:*", "workspace:^", "workspace:~"].includes(range)) {
            throw new Error(`Unsupported workspace range: ${range}`);
          }
          if (range.startsWith("workspace:") && field !== "devDependencies") dependencies.push(name);
        }
      }
      return [
        {
          directory,
          manifest: manifest as Manifest,
          name: manifest.name,
          version: manifest.version,
          dependencies: [...new Set(dependencies)],
        },
      ];
    });
}

/** Inspect manifests and pending JSON change notes without writing. Example: inspectRepository(process.cwd()).packages. */
export function inspectRepository(root: string): ReleasePlan {
  const packages = discover(root);
  const folder = join(root, ".changes");
  const records = existsSync(folder)
    ? readdirSync(folder)
        .filter((file) => file.endsWith(".json"))
        .sort()
        .map((file) => {
          const text = readFileSync(join(folder, file), "utf8");
          return { change: parseChange(file.slice(0, -5), JSON.parse(text)), sha256: sha256(text) };
        })
    : [];
  return {
    format: 1,
    mode: "dry-run",
    source: resolve(root),
    commit: git(root, "rev-parse", "HEAD").trim(),
    measuredAt: new Date().toISOString(),
    changes: records.map((r) => ({ id: r.change.id, sha256: r.sha256 })),
    packages: planVersions(
      packages,
      records.map((r) => r.change),
    ),
  };
}
function candidateManifest(manifest: Manifest, plan: ReleasePlan, packing = false): Manifest {
  const versions = new Map(plan.packages.map((p) => [p.name, p.next]));
  const candidate = structuredClone(manifest);
  candidate.version = versions.get(manifest.name)!;
  // Draft artifacts retain the repository's publication guard and source exports.
  candidate.private = true;
  if (!packing) return candidate;
  delete candidate.publishConfig;
  for (const field of dependencyFields) {
    if (candidate[field] === undefined) continue;
    candidate[field] = Object.fromEntries(
      Object.entries(object(candidate[field])).map(([name, range]) => {
        if (typeof range !== "string") throw new Error(`Invalid dependency: ${name}`);
        if (!range.startsWith("workspace:")) return [name, range];
        const version = versions.get(name);
        if (!version) throw new Error(`Unknown workspace dependency: ${name}`);
        if (!["workspace:*", "workspace:^", "workspace:~"].includes(range))
          throw new Error(`Unsupported workspace range: ${range}`);
        return [name, `${range === "workspace:*" ? "" : range.slice(-1)}${version}`];
      }),
    );
  }
  return candidate;
}
function prepareOutput(root: string, output: string): void {
  const actualOutput = join(realpathSync(dirname(resolve(output))), resolve(output).split(sep).at(-1)!);
  const relativePath = relative(realpathSync(root), actualOutput);
  if (!relativePath.startsWith(`..${sep}`) && relativePath !== "..")
    throw new Error("Output must be outside the checkout");
  mkdirSync(output, { recursive: false });
}
function previousChangelog(root: string, directory: string): string {
  const path = join(root, directory, "CHANGELOG.md");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** Write candidate manifests and changelogs to a new external directory. Example: writePreview(root, "/tmp/flop-preview"). */
export function writePreview(root: string, output: string): ReleasePlan {
  const plan = inspectRepository(root);
  const packages = discover(root);
  prepareOutput(root, output);
  writeFileSync(join(output, "release-plan.json"), json(plan));
  for (const pkg of packages) {
    const destination = join(output, pkg.directory);
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, "package.json"), json(candidateManifest(pkg.manifest, plan)));
    writeFileSync(
      join(destination, "CHANGELOG.md"),
      renderChangelog(
        plan.packages.find((p) => p.name === pkg.name)!,
        previousChangelog(root, pkg.directory),
      ),
    );
  }
  return plan;
}
function copyRegular(source: string, target: string): void {
  if (!lstatSync(source).isFile()) throw new Error(`Expected regular file: ${source}`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
function buildFiles(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Symlink in build output");
    return entry.isDirectory() ? buildFiles(path) : [path];
  });
}
function exportedPaths(value: unknown): string[] {
  if (typeof value === "string") return value.startsWith("./") ? [value.slice(2)] : [];
  if (value === null || value === undefined) return [];
  return Object.values(object(value)).flatMap(exportedPaths);
}

/** Pack a clean built checkout as unsigned private draft artifacts. Example: packRepository(root, "/tmp/flop-artifacts"). */
export function packRepository(root: string, output: string): ReleasePlan {
  if (git(root, "status", "--porcelain", "--untracked-files=normal").trim())
    throw new Error("Pack requires a clean checkout");
  const plan = writePreview(root, output);
  const packages = discover(root);
  const hashes: string[] = [];
  for (const pkg of packages) {
    const staging = join(output, pkg.directory);
    const tracked = git(root, "ls-files", "-z", "--", pkg.directory).split("\0").filter(Boolean);
    const files: string[] = [];
    for (const file of tracked) {
      const local = relative(pkg.directory, file);
      if (local === "package.json" || local === "CHANGELOG.md") continue;
      if (local.startsWith("..") || local.split(sep).some((part) => ["node_modules", ".next", ".git"].includes(part)))
        throw new Error("Invalid tracked package path");
      copyRegular(join(root, file), join(staging, local));
      files.push(local);
    }
    for (const file of buildFiles(join(root, pkg.directory, "dist"))) {
      const local = relative(join(root, pkg.directory), file);
      copyRegular(file, join(staging, local));
      files.push(local);
    }
    copyRegular(join(root, "LICENSE"), join(staging, "LICENSE"));
    const manifest = candidateManifest(pkg.manifest, plan, true);
    manifest.files = [...new Set([...files, "LICENSE", "CHANGELOG.md"])].sort();
    // The gate built the checkout. Packing must not run prepare/prepack again in a partial staging tree.
    delete manifest.scripts;
    writeFileSync(join(staging, "package.json"), json(manifest));
    const archive = `${pkg.name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`;
    execFileSync("pnpm", ["--ignore-scripts", "pack", "--out", join(resolve(output), archive)], {
      cwd: staging,
      stdio: "pipe",
    });
    const entries = new Set(
      execFileSync("tar", ["-tzf", join(output, archive)], { encoding: "utf8" })
        .trim()
        .split("\n"),
    );
    const bins = typeof manifest.bin === "string" ? [manifest.bin] : Object.values(object(manifest.bin ?? {}));
    const required = [
      "package.json",
      "LICENSE",
      "CHANGELOG.md",
      ...exportedPaths(manifest.exports),
      ...bins.map((b) => String(b).replace(/^\.\//, "")),
    ];
    for (const file of required) {
      if (file.includes("*") || !entries.has(`package/${file}`))
        throw new Error(`Missing packed entry: ${pkg.name} ${file}`);
    }
    hashes.push(`${sha256(readFileSync(join(output, archive)))}  ${archive}`);
  }
  const notes =
    "# Unsigned release candidate\n\nThis is a dry-run package snapshot. No npm package was published.\n\n" +
    `Commit: ${plan.commit}\nMeasured at: ${plan.measuredAt}\n\n` +
    plan.packages.map((p) => `- ${p.name}: ${p.current} -> ${p.next}`).join("\n") +
    "\n\nSHA-256 sums cover the tarballs and release plan. DID signing is a separate orchestrator step. Source exports require the workspace TypeScript toolchain. Workspace dependency versions are candidates and are not asserted to exist on npm.\n";
  writeFileSync(join(output, "RELEASE.md"), notes);
  for (const file of ["release-plan.json", "RELEASE.md"])
    hashes.push(`${sha256(readFileSync(join(output, file)))}  ${file}`);
  writeFileSync(join(output, "SHA256SUMS"), hashes.sort().join("\n") + "\n");
  return plan;
}
