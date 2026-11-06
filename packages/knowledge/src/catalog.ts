// SPDX-License-Identifier: Apache-2.0
import type { Concept, Manifest, Requirement } from "./schema";

export interface Edge {
  source: string;
  target: string | null;
  reference: string;
  relation: string;
}

/** Resolve only exact catalog IDs or root-relative concept paths. @example resolveConcept(manifest, "/overview.md") */
export function resolveConcept(manifest: Manifest, reference: string): Concept | undefined {
  const path = reference.startsWith("/") ? reference.slice(1) : reference;
  return manifest.concepts.find((c) => c.id === path || c.path === path);
}

/** Build directed declared edges. External or missing targets remain unresolved. @example graph(manifest) */
export function graph(manifest: Manifest): Edge[] {
  const edges: Edge[] = [];
  for (const c of manifest.concepts) {
    for (const [relation, references] of Object.entries(c.relationships)) {
      for (const reference of new Set(references)) {
        edges.push({ source: c.id, target: resolveConcept(manifest, reference)?.id ?? null, reference, relation });
      }
    }
  }
  return edges;
}

/** Local case-insensitive substring filter. No relevance or confidence score is invented. @example searchCatalog(manifest, "agent") */
export function searchCatalog(manifest: Manifest, query: string, type = ""): Concept[] {
  const q = query.trim().toLocaleLowerCase("en-US");
  return manifest.concepts.filter(
    (c) =>
      (!type || c.type === type) &&
      [c.id, c.title, c.description ?? "", ...c.tags, ...c.source_paths]
        .join("\n")
        .toLocaleLowerCase("en-US")
        .includes(q),
  );
}

/** Match exact cited repo paths, not words or inferred semantic links. @example citedConcepts(manifest, requirement) */
export function citedConcepts(manifest: Manifest, requirement: Requirement): Concept[] {
  const paths = new Set(requirement.citations.filter((c) => c.repo === "flop-labs/flop-core").map((c) => c.path));
  return manifest.concepts.filter((c) => c.source_paths.some((path) => paths.has(path)));
}

/** Permit only public HTTPS links for quoted resources. Never execute catalog URLs. @example sourceLink(concept.resource) */
export function sourceLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Quote a catalog ID as one inert POSIX shell argument. @example conceptCommand("overview") */
export function conceptCommand(id: string): string {
  return `flop knowledge get '${id.replace(/'/g, "'\\''")}' --live --json`;
}
