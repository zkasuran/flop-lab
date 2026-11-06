// SPDX-License-Identifier: Apache-2.0
export interface Concept {
  id: string;
  path: string;
  title: string;
  type: string;
  description?: string;
  resource?: string;
  confidence?: string;
  lifecycle?: string;
  owner?: string;
  tags: string[];
  source_paths: string[];
  source_hashes: string[];
  source_evidence: string[];
  relationships: Record<string, string[]>;
}
export interface Manifest {
  name: string;
  okfVersion: string;
  generatedBy: string;
  conceptCount: number;
  sources: string[];
  concepts: Concept[];
  warnings: string[];
}
export interface ConceptDocument {
  concept: Concept;
  content: string;
  warnings: string[];
}
export interface Citation {
  repo: string;
  path: string;
  anchor: string;
  lines: string | null;
  sha256: string | null;
}
export interface Requirement {
  key: string;
  kind: string;
  title: string | null;
  specStatus: string;
  implementationStatus: string;
  evidenceStatus: string;
  text: string;
  citations: Citation[];
  warnings: string[];
  snapshot: string | null;
}
export interface SearchResult {
  query: string;
  results: (Concept & { score: number; snippet: string })[];
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length > 1_000_000) throw new Error("Expected bounded text");
  return value;
}
function required(value: unknown): string {
  const result = text(value);
  if (!result.trim()) throw new Error("Expected nonempty text");
  return result;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 10_000) throw new Error("Expected a bounded array");
  return value;
}
function strings(value: unknown): string[] {
  return array(value).map(text);
}
function optional(value: unknown): string | undefined {
  return value === undefined ? undefined : text(value);
}
function nullable(value: unknown): string | null {
  return value === null ? null : text(value);
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Expected a finite number");
  return value;
}

/** Validate used fields without discarding extra fields from the retained raw response. @example parseConcept(value) */
export function parseConcept(value: unknown): Concept {
  const v = object(value);
  const relationships = Object.fromEntries(
    Object.entries(object(v.relationships ?? {})).map(([key, values]) => [key, strings(values)]),
  );
  return {
    id: required(v.id),
    path: required(v.path),
    title: required(v.title),
    type: required(v.type),
    description: optional(v.description),
    resource: optional(v.resource),
    confidence: optional(v.confidence),
    lifecycle: optional(v.lifecycle),
    owner: optional(v.owner),
    tags: strings(v.tags ?? []),
    source_paths: strings(v.source_paths ?? []),
    source_hashes: strings(v.source_hashes ?? []),
    source_evidence: strings(v.source_evidence ?? []),
    relationships,
  };
}

/** Parse a manifest and reject ambiguous graph identifiers. Count disagreement stays a warning. @example parseManifest(value) */
export function parseManifest(value: unknown): Manifest {
  const v = object(value);
  const concepts = array(v.concepts).map(parseConcept);
  const aliases = new Map<string, string>();
  for (const c of concepts) {
    for (const alias of new Set([c.id, c.path])) {
      if (aliases.has(alias)) throw new Error(`Duplicate concept alias: ${alias}`);
      aliases.set(alias, c.id);
    }
  }
  const count = number(v.conceptCount);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid concept count");
  const warnings = strings(v.warnings);
  if (count !== concepts.length)
    warnings.push(`Declared count ${count} differs from received count ${concepts.length}`);
  return {
    name: required(v.name),
    okfVersion: required(v.okfVersion),
    generatedBy: required(v.generatedBy),
    conceptCount: count,
    sources: strings(v.sources),
    concepts,
    warnings,
  };
}

/** Validate a concept document. Its Markdown remains inert source text. @example parseDocument(value) */
export function parseDocument(value: unknown): ConceptDocument {
  const v = object(value);
  return { concept: parseConcept(v.concept), content: text(v.content), warnings: strings(v.warnings) };
}

/** Preserve service search scores without interpreting them as confidence. @example parseSearch(value) */
export function parseSearch(value: unknown): SearchResult {
  const v = object(value);
  return {
    query: text(v.query),
    results: array(v.results).map((entry) => {
      const row = object(entry);
      return { ...parseConcept(row), score: number(row.score), snippet: text(row.snippet) };
    }),
  };
}

/** Validate the displayed requirement and every citation. Status text is a service claim. @example parseRequirement(value) */
export function parseRequirement(value: unknown): Requirement {
  const v = object(value);
  return {
    key: required(v.key),
    kind: required(v.kind),
    title: nullable(v.title),
    specStatus: text(v.specStatus),
    implementationStatus: text(v.implementationStatus),
    evidenceStatus: text(v.evidenceStatus),
    text: text(v.text),
    snapshot: nullable(v.snapshot),
    warnings: strings(v.warnings),
    citations: array(v.citations).map((entry) => {
      const c = object(entry);
      return {
        repo: required(c.repo),
        path: required(c.path),
        anchor: text(c.anchor),
        lines: nullable(c.lines),
        sha256: nullable(c.sha256),
      };
    }),
  };
}

/** Pack/card responses have no advertised output schema. Retain bounded JSON or text only. @example parseOpaque(value) */
export function parseOpaque(value: unknown): unknown {
  if (typeof value === "string") return required(value);
  object(value);
  if (JSON.stringify(value).length > 1_000_000) throw new Error("Response exceeds inspection limit");
  return value;
}
