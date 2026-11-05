// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { sections, tools, toolHref, toolsIn, type Tool } from "../content/tools";

describe("tool navigation contract", () => {
  it("keeps routes unique and relative so palette destinations cannot inject script URLs", () => {
    expect(new Set(tools.map((tool) => tool.slug)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool.href).toMatch(/^\/[a-z0-9-]+$/);
      expect(tool.repoPath).toMatch(/^(packages|plugins)\/[a-z0-9-]+$/);
    }
  });
  it("puts every tool in exactly one known section", () => {
    const ids = new Set(sections.map((section) => section.id));
    expect(ids.size).toBe(sections.length);
    for (const tool of tools) expect(ids.has(tool.section)).toBe(true);
    expect(sections.reduce((n, section) => n + toolsIn(section.id).length, 0)).toBe(tools.length);
  });
  it("does not send visitors to missing pages for planned tools", () => {
    const tool: Tool = {
      slug: "test",
      name: "Test",
      tagline: "Test",
      section: "verify",
      status: "planned",
      href: "/test",
      repoPath: "packages/test",
    };
    expect(toolHref(tool)).toBe("https://github.com/zkasuran/flop-lab/tree/main/packages/test");
    expect(toolHref({ ...tool, status: "alpha" })).toBe("/test");
    expect(toolHref({ ...tool, status: "live" })).toBe("/test");
  });
});
