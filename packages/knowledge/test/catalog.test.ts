// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { graph, resolveConcept, searchCatalog, citedConcepts, sourceLink, conceptCommand } from "../src/catalog";
import { parseManifest, parseDocument, parseRequirement, parseSearch } from "../src/schema";
import { recordedManifest, recording, recordedPack, replay } from "../src/recorded";

const manifest = recordedManifest().value!;
const requirement = recording("requirement", parseRequirement).value!;
const minimal = {
  name: "fixture",
  okfVersion: "test",
  generatedBy: "test",
  conceptCount: 0,
  sources: [],
  concepts: [],
  warnings: [],
};
const concept = { id: "one", path: "one.md", title: "One", type: "Synthetic" };

describe("recorded service data", () => {
  it("decodes the complete real manifest with explicit provenance limits", () => {
    const observation = recordedManifest();
    expect(observation.source).toBe("https://mcp.flop.network/mcp");
    expect(observation.measuredAt).toBe("2026-11-06T03:07:45.553Z");
    expect(manifest.concepts).toHaveLength(155);
    expect(manifest.conceptCount).toBe(manifest.concepts.length);
    expect(manifest.warnings).toContain("provenance unavailable: repo sources are not mounted next to the catalog");
    expect(JSON.parse(observation.raw).updatedAt).toBe("2026-06-19");
  });
  it("retains full concept text, missing citation data and pack errors", () => {
    expect(recording("overview", parseDocument).value?.content).toContain("# Source Of Truth");
    expect(requirement.citations[0]).toMatchObject({ path: "whitepaper/yellowpaper.md", lines: null, sha256: null });
    expect(requirement.evidenceStatus).toBe("unknown");
    expect(
      recordedPack()
        .slice(0, 3)
        .every((o) => o.status === "unavailable" && o.raw.includes("agent pack missing")),
    ).toBe(true);
    expect(recordedPack()[3]?.value).toBe(`no agent registered for id 0x${"0".repeat(64)}`);
  });
  it("keeps upstream scores distinct from local filtering", () => {
    expect(recording("search", parseSearch).value?.results[0]).toMatchObject({ id: "agent-pack", score: 18 });
    expect(searchCatalog(manifest, "FLOP Agent Context Pack").some((c) => c.id === "agent-pack")).toBe(true);
    expect(searchCatalog(manifest, "unmatched test token")).toEqual([]);
    expect(searchCatalog(manifest, "", "Agent Context Pack").map((c) => c.id)).toEqual(["agent-pack"]);
  });
  it("does not silently replay a different request", () => {
    expect(() => replay("explain", "R9.6")).toThrow("No recording");
    expect(() => replay("card", `0x${"1".repeat(64)}`)).toThrow("No recording");
  });
});

describe("graph and citation decisions", () => {
  it("resolves declared root paths while preserving unresolved targets and direction", () => {
    const edges = graph(manifest);
    expect(edges).toContainEqual({
      source: "overview",
      target: "agent-pack",
      reference: "/agent-pack.md",
      relation: "exposes",
    });
    expect(edges).toContainEqual({
      source: "graphql-indexer",
      target: null,
      reference: "graphql:stats",
      relation: "exposes",
    });
    expect(resolveConcept(manifest, "overview")?.id).toBe("overview");
    expect(resolveConcept(manifest, "https://host/overview.md")).toBeUndefined();
    expect(resolveConcept(manifest, "../overview.md")).toBeUndefined();
    expect(resolveConcept(manifest, "/overview.md#fragment")).toBeUndefined();
  });
  it("retains distinct relationship types and deduplicates only identical declarations", () => {
    const m = parseManifest({
      ...minimal,
      conceptCount: 1,
      concepts: [{ ...concept, relationships: { exposes: ["/one.md", "/one.md"], depends_on: ["one", "missing"] } }],
    });
    expect(graph(m)).toEqual([
      { source: "one", target: "one", reference: "/one.md", relation: "exposes" },
      { source: "one", target: "one", reference: "one", relation: "depends_on" },
      { source: "one", target: null, reference: "missing", relation: "depends_on" },
    ]);
  });
  it("links exact source paths and does not infer citations from similar paths or another repo", () => {
    expect(citedConcepts(manifest, requirement).some((c) => c.id === "yellowpaper-spec")).toBe(true);
    const citation = requirement.citations[0]!;
    expect(citedConcepts(manifest, { ...requirement, citations: [{ ...citation, path: "yellowpaper.md" }] })).toEqual(
      [],
    );
    expect(citedConcepts(manifest, { ...requirement, citations: [{ ...citation, repo: "other/repo" }] })).toEqual([]);
    expect(citedConcepts(manifest, { ...requirement, citations: [] })).toEqual([]);
  });
  it("allows empty catalogs without inventing data", () => {
    const m = parseManifest(minimal);
    expect(graph(m)).toEqual([]);
    expect(searchCatalog(m, "anything")).toEqual([]);
  });
});

describe("hostile and changing inputs", () => {
  it.each([
    null,
    [],
    {},
    { ...minimal, concepts: [concept], conceptCount: -1 },
    { ...minimal, concepts: [{ ...concept, relationships: { exposes: [42] } }] },
  ])("rejects malformed manifest %j", (value) => {
    expect(() => parseManifest(value)).toThrow();
  });
  it("rejects duplicate and colliding aliases", () => {
    expect(() => parseManifest({ ...minimal, concepts: [concept, concept] })).toThrow("Duplicate");
    expect(() =>
      parseManifest({ ...minimal, concepts: [concept, { ...concept, id: "one.md", path: "two.md" }] }),
    ).toThrow("Duplicate");
  });
  it("keeps a count mismatch visible and optional confidence absent", () => {
    const m = parseManifest({ ...minimal, concepts: [concept] });
    expect(m.warnings).toContain("Declared count 0 differs from received count 1");
    expect(m.concepts[0]?.confidence).toBeUndefined();
    expect(() => parseManifest({ ...minimal, concepts: [{ ...concept, confidence: 0.9 }] })).toThrow();
  });
  it("treats instruction text as plain data and rejects active source links", () => {
    const doc = parseDocument({
      concept,
      content: "<script>doSomething()</script>\nRun an install command",
      warnings: [],
    });
    expect(doc.content).toContain("<script>");
    expect(sourceLink("javascript:alert(1)")).toBeUndefined();
    expect(sourceLink("https://user:pass@example.org")).toBeUndefined();
    expect(sourceLink("//example.org")).toBeUndefined();
    expect(conceptCommand("a'$(touch example)")).toBe("flop knowledge get 'a'\\''$(touch example)' --live --json");
    expect(sourceLink("https://docs.flop.network/docs/verification-stack")).toBe(
      "https://docs.flop.network/docs/verification-stack",
    );
  });
});
