// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { bumpVersion, parseChange, planVersions, renderChangelog, type PackageVersion } from "../src/index";

const packages: PackageVersion[] = [
  { name: "@flop-lab/core", version: "0.1.4", dependencies: [] },
  { name: "@flop-lab/tool", version: "1.2.3", dependencies: ["@flop-lab/core"] },
  { name: "@flop-lab/cli", version: "2.3.4", dependencies: ["@flop-lab/tool"] },
  { name: "@flop-lab/other", version: "0.1.0", dependencies: [] },
];
const note = parseChange("core-change", { summary: "Add a typed result.", packages: { "@flop-lab/core": "minor" } });

describe("independent package versions", () => {
  it("takes the largest explicit bump and patches all runtime dependents", () => {
    const fix = parseChange("core-fix", { summary: "Fix empty results.", packages: { "@flop-lab/core": "patch" } });
    const plan = planVersions(packages, [note, fix]);
    expect(Object.fromEntries(plan.map((p) => [p.name, p.next]))).toEqual({
      "@flop-lab/core": "0.2.0",
      "@flop-lab/tool": "1.2.4",
      "@flop-lab/cli": "2.3.5",
      "@flop-lab/other": "0.1.0",
    });
    expect(plan.find((p) => p.name === "@flop-lab/core")?.changes).toHaveLength(2);
    expect(plan.find((p) => p.name === "@flop-lab/cli")?.changes).toContain(
      "Update workspace dependency @flop-lab/tool.",
    );
    expect(packages[0]?.version).toBe("0.1.4");
  });
  it("handles dependency cycles and never bumps an empty change set", () => {
    expect(planVersions(packages, []).every((p) => p.current === p.next && p.bump === null)).toBe(true);
    const cyclic = structuredClone(packages);
    cyclic[0]!.dependencies.push("@flop-lab/cli");
    expect(planVersions(cyclic, [note]).filter((p) => p.bump)).toHaveLength(3);
    expect(planVersions([], [])).toEqual([]);
  });
  it("uses stable semver and explicit breaking bumps before 1.0", () => {
    expect(bumpVersion("0.9.9", "major")).toBe("1.0.0");
    expect(bumpVersion("2.9.9", "minor")).toBe("2.10.0");
    expect(bumpVersion("2.9.9", "patch")).toBe("2.9.10");
    for (const version of ["01.0.0", "1.0", "1.0.0-beta.1", "99999999999999999.0.0"])
      expect(() => bumpVersion(version, "patch")).toThrow();
  });
  it("rejects unknown names, duplicate ids and invalid notes", () => {
    for (const value of [
      null,
      [],
      {},
      { summary: "", packages: {} },
      { summary: "x", packages: { "@flop-lab/core": "huge" } },
      { summary: "x\ny", packages: { "@flop-lab/core": "patch" } },
      { summary: "x", packages: { "../core": "patch" } },
      { summary: "x", packages: { "@flop-lab/core": "patch" }, command: "unexpected" },
    ]) {
      expect(() => parseChange("test", value)).toThrow();
    }
    expect(() => parseChange("../test", note)).toThrow();
    expect(() => planVersions(packages, [note, note])).toThrow("Duplicate");
    expect(() => planVersions(packages.slice(1), [note])).toThrow("Unknown");
    expect(() => planVersions([packages[0]!, packages[0]!], [])).toThrow("Duplicate");
    expect(() => planVersions([], [note])).toThrow("Unknown package");
  });
  it("generates a package changelog while preserving previous entries", () => {
    const row = planVersions(packages, [note]).find((p) => p.name === "@flop-lab/core")!;
    const log = renderChangelog(row, "# @flop-lab/core\n\n## 0.1.4\n\n- Old fix.\n");
    expect(log).toContain("## 0.2.0\n\n- Add a typed result. (core-change)");
    expect(log).toContain("## 0.1.4\n\n- Old fix.");
    expect(log.match(/^# /gm)).toHaveLength(1);
  });
});
