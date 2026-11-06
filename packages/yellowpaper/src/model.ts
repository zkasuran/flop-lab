// SPDX-License-Identifier: Apache-2.0
import type { Difference } from "@flop-lab/spec";

export interface Heading {
  id: string;
  title: string;
  depth: number;
  line: number;
  reference: string | null;
}
export interface SearchEntry {
  id: string;
  title: string;
  kind: "heading" | "glossary" | "parameter" | "open-item";
  detail: string;
}
export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  section: string;
}
export interface PublicIssue {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  url: string;
  updatedAt: string;
}
export interface IssueCatalog {
  measuredAt: string;
  source: string;
  issues: PublicIssue[];
}
export interface OpenItem {
  id: string;
  title: string;
  status: string;
  text: string;
  line: number;
  internalReferences: number[];
  publicReferences: number[];
}
export interface Reader {
  sha: string;
  measuredAt: string;
  source: string;
  bytes: number;
  headings: Heading[];
  glossary: GlossaryTerm[];
  openItems: OpenItem[];
  parameters: Difference[];
  search: SearchEntry[];
  html: string;
  unresolvedLinks: string[];
  warnings: string[];
}
