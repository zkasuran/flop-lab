// SPDX-License-Identifier: Apache-2.0
import { parseIndexerData, type IndexerEntity } from "@flop-lab/mcp";
import type { Entity, Evidence, Exploration } from "./types";

function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid explorer object");
  return value as Record<string, unknown>;
}
function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid explorer string");
  return value;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid explorer count");
  return value;
}
function time(value: unknown): string {
  const text = str(value);
  if (!Number.isFinite(Date.parse(text))) throw new Error("Invalid explorer time");
  return text;
}
function array<T>(value: unknown, parse: (v: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error("Invalid explorer array");
  return value.map(parse);
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  const text = str(value);
  if (!choices.includes(text as T)) throw new Error("Invalid explorer state");
  return text as T;
}
function evidence(value: unknown): Evidence {
  const e = obj(value);
  const label = str(e.label),
    tool = str(e.tool);
  const state = choice(e.state, ["observed", "unavailable"]);
  const raw = e.raw === null ? null : str(e.raw);
  if (state === "observed" && tool === "flop_indexer_query") {
    if (raw === null) throw new Error("Missing raw evidence");
    const root = label === "parentBlock" ? "block" : label.startsWith("positionsAs") ? "sponsorPositions" : label;
    const parsed = parseIndexerData(root as IndexerEntity, JSON.parse(raw));
    if (JSON.stringify(parsed) !== JSON.stringify(e.data)) throw new Error("Displayed data differs from raw evidence");
  }
  return {
    label,
    source: str(e.source),
    tool,
    query: e.query === null ? null : str(e.query),
    variables: obj(e.variables),
    measuredAt: time(e.measuredAt),
    state,
    data: e.data,
    raw,
    error: e.error === null ? null : str(e.error),
  };
}

/** Validate a saved report or same-origin API response before rendering it.
 * Indexed displayed values must agree with their raw response. This is not source authentication.
 * @example const report = parseExploration(await response.json())
 */
export function parseExploration(value: unknown): Exploration {
  const r = obj(value);
  return {
    input: str(r.input),
    mode: choice(r.mode, ["live", "recorded"]),
    searchedAt: time(r.searchedAt),
    status: choice(r.status, ["found", "not_found", "unavailable", "partial"]),
    entities: array(r.entities, (value) => {
      const e = obj(value);
      return {
        kind: choice(e.kind, ["block", "transaction", "account", "channel", "htlc"]),
        id: str(e.id),
        evidence: array(e.evidence, evidence),
        notes: array(e.notes, str),
        derived: array(e.derived, (value) => {
          const d = obj(value);
          return {
            label: str(d.label),
            value: str(d.value),
            formula: str(d.formula),
            evidence: array(d.evidence, str),
          };
        }),
        links: array(e.links, (value) => {
          const l = obj(value);
          return { label: str(l.label), input: str(l.input) };
        }),
      } satisfies Entity;
    }),
    lookups: array(r.lookups, evidence),
    requests: count(r.requests),
    durationMs: count(r.durationMs),
    cache: choice(r.cache, ["hit", "miss"]),
  };
}
