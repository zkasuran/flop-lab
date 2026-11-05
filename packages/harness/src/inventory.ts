// SPDX-License-Identifier: Apache-2.0
import { extractDocument, type SourceDocument, type SourceUnit } from "./extraction";
import { integer, object, text } from "./validation";
import type { Claim } from "./types";

export interface InventoryUnit extends SourceUnit {
  checks: string[];
  boundary: string;
}
export interface InventoryPage extends Omit<SourceDocument, "raw"> {
  units: InventoryUnit[];
}

function boundary(unit: SourceUnit, id: string): string {
  if (!unit.normative)
    return "Informative context or open specification. No deployed behavior is asserted by this inventory.";
  if (unit.kind === "code")
    return "Example or wire format. Requires execution with its stated SDK, runtime or host prerequisites; a public read does not execute it.";
  if (/team-and-company|competitive-landscape|demand-and-broker|official-links|testnet-and-timeline/.test(id))
    return "Organizational, comparative or future-facing statement. Public devnet responses do not establish it.";
  if (/run-|operator-config|upgrade|sdk-references|send-to-specific-miner/.test(id))
    return "Requires the named package, operator host, reachable worker or signed session. The hosted read-only boundary does not exercise those paths.";
  if (/planned|draft|not yet|under review|unbuilt|not currently|pending|roadmap/i.test(unit.quote))
    return "Design, target or explicit implementation gap. A present-day public response cannot establish the stated future behavior.";
  if (/TEE|TOPLOC|signature|attest|cryptograph|proof|Merkle|challenge|fraud|slash|audit/i.test(unit.quote))
    return "Needs authenticated transcripts, DA evidence, trust material and the relevant verifier or dispute execution. API fields alone are not proof.";
  if (/stake|reward|emission|halv|supply|FLOP|escrow|fee|burn|vesting|budget|proxy/i.test(unit.quote))
    return "Needs versioned runtime state and finalized economic or policy transitions. Catalog values and sampled indexer rows cannot prove enforcement.";
  if (/block|consensus|validator|finality|BABE|Aleph|latency|throughput/i.test(unit.quote))
    return "Needs authenticated chain state or a defined measurement interval. Isolated public snapshots cannot establish consensus or performance guarantees.";
  return "Retained source statement. No public predicate has been established for the whole statement; it needs domain-specific evidence or clarification.";
}

/** Join exact source blocks to executable subclaims, retaining every unmatched block. @example inventoryPage(document, claims) */
export function inventoryPage(doc: SourceDocument, claims: Claim[]): InventoryPage {
  const { raw: _raw, ...metadata } = doc;
  return {
    ...metadata,
    units: extractDocument(doc).map((unit) => {
      const checks = claims.filter((claim) => claim.source.path === unit.id).map((claim) => claim.id);
      return {
        ...unit,
        checks,
        boundary: checks.length
          ? "Only the named predicate is checked. A passing subclaim does not verify every assertion in this source block."
          : boundary(unit, doc.id),
      };
    }),
  };
}

/** Validate a recorded source before extracting it. @example parseDocument(JSON.parse(raw)) */
export function parseDocument(value: unknown): SourceDocument {
  const doc = object(value);
  const id = text(doc.id);
  const url = text(doc.url);
  const measuredAt = text(doc.measuredAt);
  const raw = text(doc.raw);
  const firstLine = integer(doc.firstLine);
  if (
    !/^[a-z0-9-]+$/.test(id) ||
    !url.startsWith("https://") ||
    !Number.isFinite(Date.parse(measuredAt)) ||
    !firstLine ||
    raw.length > 200_000
  )
    throw new Error("Invalid source recording");
  if (doc.format !== "html" && doc.format !== "markdown") throw new Error("Invalid source format");
  return { id, url, measuredAt, raw, firstLine, format: doc.format, title: text(doc.title) };
}
