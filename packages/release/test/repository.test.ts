// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { inspectRepository, writePreview } from "../src/repository";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const folders: string[] = [];
function temporary() {
  const folder = mkdtempSync(join(tmpdir(), "flop-release-test-"));
  folders.push(folder);
  return folder;
}
afterEach(() => {
  folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

it("previews actual repository manifests without changing source versions", () => {
  const before = readFileSync(join(root, "packages/release/package.json"), "utf8");
  const out = join(temporary(), "preview");
  const plan = writePreview(root, out);
  const candidate = JSON.parse(readFileSync(join(out, "packages/release/package.json"), "utf8")) as {
    version: string;
    private: boolean;
  };
  expect(candidate.version).toBe(plan.packages.find((p) => p.name === "@flop-lab/release")?.next);
  expect(candidate.private).toBe(true);
  expect(readFileSync(join(root, "packages/release/package.json"), "utf8")).toBe(before);
  expect(plan.mode).toBe("dry-run");
  expect(plan.commit).toMatch(/^[a-f0-9]{40}$/);
  expect(plan.source).toBe(root.replace(/\/$/, ""));
  expect(plan.changes.every((c) => /^[a-f0-9]{64}$/.test(c.sha256))).toBe(true);
  expect(readFileSync(join(out, "packages/cli/package.json"), "utf8")).toContain("workspace:");
});
it("refuses existing destinations and output inside the checkout, including symlink aliases", () => {
  const folder = temporary();
  expect(() => writePreview(root, folder)).toThrow();
  expect(() => writePreview(root, join(root, "preview-output"))).toThrow("outside");
  symlinkSync(root, join(folder, "alias"), "dir");
  expect(() => writePreview(root, join(folder, "alias", "preview-output"))).toThrow("outside");
});
it("is stable over the same notes apart from observation time", () => {
  const first = inspectRepository(root);
  expect(inspectRepository(root).packages).toEqual(first.packages);
  expect(first.packages.length).toBeGreaterThan(0);
});
