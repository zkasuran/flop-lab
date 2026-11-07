// SPDX-License-Identifier: Apache-2.0
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../next.config";

// The documentation pages render per request so each response can carry its own CSP nonce.
// readCatalog() then reads package files at request time, and the deployed function only has
// the files Next traces. When they are missing the catalog is empty and /docs/<package> is a 404.
const included = config.outputFileTracingIncludes ?? {};
const root = resolve(process.cwd(), "../..");

describe("deployed function file tracing for the documentation pages", () => {
  it("names every route that reads the package catalog at request time", () => {
    for (const route of ["/docs", "/docs/[package]", "/zh/docs", "/"]) {
      expect(included[route], route).toBeDefined();
      expect(included[route], route).toEqual(
        expect.arrayContaining(["../../packages/*/package.json", "../../packages/*/README.md"]),
      );
    }
  });
  it("matches a real package manifest and README for every package directory", () => {
    const packages = readdirSync(resolve(root, "packages"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(resolve(root, "packages", entry.name, "package.json")))
      .map((entry) => entry.name);
    expect(packages.length).toBeGreaterThan(30);
    for (const name of packages) {
      expect(existsSync(resolve(root, "packages", name, "README.md")), `${name} README`).toBe(true);
    }
  });
  it("keeps the signed build proof in the trace for its route", () => {
    expect(included["/SIGNATURE.json"]).toEqual(["../../SIGNATURE.json"]);
  });
});
