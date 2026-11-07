// SPDX-License-Identifier: Apache-2.0
export type Bump = "patch" | "minor" | "major";
export interface PackageVersion {
  name: string;
  version: string;
  dependencies: string[];
}
export interface Change {
  id: string;
  summary: string;
  packages: Record<string, Bump>;
}
export interface PlannedVersion {
  name: string;
  current: string;
  next: string;
  bump: Bump | null;
  changes: string[];
}
const ranks: Record<Bump, number> = { patch: 1, minor: 2, major: 3 };
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const namePattern = /^@flop-lab\/[a-z0-9][a-z0-9-]*$/;

/** Parse a repository change note. Example: parseChange("parser-fix", JSON.parse(text)). */
export function parseChange(id: string, value: unknown): Change {
  if (!/^[a-z0-9][a-z0-9-]{0,100}$/.test(id) || !value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid change note");
  }
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).some((key) => !["summary", "packages"].includes(key)) ||
    typeof row.summary !== "string" ||
    !row.summary.trim() ||
    row.summary.length > 500 ||
    /[\r\n\u2013\u2014]/.test(row.summary) ||
    !row.packages ||
    typeof row.packages !== "object" ||
    Array.isArray(row.packages)
  ) {
    throw new Error(`Invalid change note: ${id}`);
  }
  const entries = Object.entries(row.packages);
  if (
    !entries.length ||
    entries.some(([name, bump]) => !namePattern.test(name) || !["patch", "minor", "major"].includes(String(bump)))
  ) {
    throw new Error(`Invalid package bumps: ${id}`);
  }
  return { id, summary: row.summary.trim(), packages: Object.fromEntries(entries) as Record<string, Bump> };
}

/** Bump a stable version explicitly, including major changes before 1.0. Example: bumpVersion("0.1.0", "minor") === "0.2.0". */
export function bumpVersion(version: string, bump: Bump): string {
  if (!versionPattern.test(version) || !Object.hasOwn(ranks, bump)) throw new Error("Expected stable semver and bump");
  const parts = version.split(".").map(Number);
  if (parts.some((n) => !Number.isSafeInteger(n) || n === Number.MAX_SAFE_INTEGER))
    throw new Error("Version out of range");
  const [major, minor, patch] = parts as [number, number, number];
  return bump === "major"
    ? `${major + 1}.0.0`
    : bump === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;
}

/** Build independent versions and patch runtime dependents to closure. Example: planVersions(packages, changes). */
export function planVersions(packages: readonly PackageVersion[], changes: readonly Change[]): PlannedVersion[] {
  const names = new Set(packages.map((p) => p.name));
  if (names.size !== packages.length) throw new Error("Duplicate package name");
  for (const p of packages) {
    if (!namePattern.test(p.name) || !versionPattern.test(p.version)) throw new Error(`Invalid package: ${p.name}`);
    if (p.dependencies.some((name) => !names.has(name))) throw new Error(`Unknown workspace dependency: ${p.name}`);
  }
  const bumps = new Map<string, Bump>();
  const notes = new Map<string, string[]>();
  const ids = new Set<string>();
  for (const change of changes) {
    const checked = parseChange(change.id, { summary: change.summary, packages: change.packages });
    if (ids.has(checked.id)) throw new Error("Duplicate change id");
    ids.add(checked.id);
    for (const [name, bump] of Object.entries(checked.packages)) {
      if (!names.has(name)) throw new Error(`Unknown package: ${name}`);
      const current = bumps.get(name);
      if (!current || ranks[bump] > ranks[current]) bumps.set(name, bump);
      notes.set(name, [...(notes.get(name) ?? []), `${checked.summary} (${checked.id})`]);
    }
  }
  let advanced = true;
  while (advanced) {
    advanced = false;
    for (const p of packages) {
      if (!bumps.has(p.name) && p.dependencies.some((name) => bumps.has(name))) {
        bumps.set(p.name, "patch");
        advanced = true;
      }
    }
  }
  return [...packages]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const bump = bumps.get(p.name) ?? null;
      const dependencies = p.dependencies.filter((name) => bumps.has(name)).sort();
      return {
        name: p.name,
        current: p.version,
        next: bump ? bumpVersion(p.version, bump) : p.version,
        bump,
        changes: [...(notes.get(p.name) ?? []), ...dependencies.map((name) => `Update workspace dependency ${name}.`)],
      };
    });
}

/** Render a generated entry above existing package history. Example: renderChangelog(plan[0], previousText). */
export function renderChangelog(plan: PlannedVersion, previous = ""): string {
  if (!plan.bump) return previous || `# ${plan.name}\n\nNo pending version change.\n`;
  const entry = `## ${plan.next}\n\n${plan.changes.map((note) => `- ${note}`).join("\n")}\n`;
  return `# ${plan.name}\n\n${entry}${previous ? `\n${previous.replace(/^# [^\n]*\n\s*/, "")}` : ""}`;
}
