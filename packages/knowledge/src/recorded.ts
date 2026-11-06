// SPDX-License-Identifier: Apache-2.0
import { gunzipSync } from "node:zlib";
import manifest from "../fixtures/manifest.json";
import overview from "../fixtures/overview.json";
import agentPack from "../fixtures/agent-pack.json";
import yellowpaper from "../fixtures/yellowpaper-spec.json";
import gaps from "../fixtures/source-gaps.json";
import requirement from "../fixtures/requirement.json";
import pack from "../fixtures/pack.json";
import skill from "../fixtures/skill.json";
import guidance from "../fixtures/guidance.json";
import card from "../fixtures/card.json";
import search from "../fixtures/search.json";
import { parseManifest, parseDocument, parseRequirement, parseSearch, parseOpaque } from "./schema";
import type { Observation } from "./client";

const fixtures = {
  manifest,
  overview,
  "agent-pack": agentPack,
  "yellowpaper-spec": yellowpaper,
  "source-gaps": gaps,
  requirement,
  pack,
  skill,
  guidance,
  card,
  search,
};
export type RecordingKey = keyof typeof fixtures;

/** Decode one dated recording and revalidate its response. @example recording("manifest", parseManifest) */
export function recording<T>(key: RecordingKey, parse: (value: unknown) => T): Observation<T> {
  const f = fixtures[key];
  if (f.source !== "https://mcp.flop.network/mcp" || !Number.isFinite(Date.parse(f.measuredAt)))
    throw new Error("Invalid fixture provenance");
  const raw =
    f.encoding === "gzip-base64"
      ? gunzipSync(Buffer.from(f.raw, "base64"), { maxOutputLength: 2_000_000 }).toString("utf8")
      : f.raw;
  const base = { source: f.source, tool: f.tool, args: f.args, measuredAt: f.measuredAt, raw };
  if (f.status !== "reported")
    return { ...base, status: "unavailable", error: "error" in f ? f.error : "Unavailable recording" };
  let value: unknown = raw;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    /* Opaque service text is retained. */
  }
  return { ...base, status: "reported", value: parse(value) };
}

/** Load the full dated manifest for offline browsing. @example recordedManifest().value */
export function recordedManifest() {
  return recording("manifest", parseManifest);
}

/** Replay only inputs covered by the recording. Never substitute an unrelated answer. @example replay("get", "overview") */
export function replay(command: string, input?: string): Observation<unknown> {
  switch (command) {
    case "catalog":
      return recordedManifest();
    case "get": {
      const key = input?.replace(/^\//, "").replace(/\.md$/, "");
      if (key === "overview" || key === "agent-pack" || key === "yellowpaper-spec" || key === "source-gaps")
        return recording(key, parseDocument);
      break;
    }
    case "search":
      if (input === "agent") return recording("search", parseSearch);
      break;
    case "explain":
      if (input === "R9.5") return recording("requirement", parseRequirement);
      break;
    case "pack":
      return recording("pack", parseOpaque);
    case "guidance":
      return recording("guidance", parseOpaque);
    case "skill":
      if (input === "flop-knowledge-catalog") return recording("skill", parseOpaque);
      break;
    case "card":
      if (input === `0x${"0".repeat(64)}`) return recording("card", parseOpaque);
      break;
  }
  throw new Error(`No recording for ${command} ${input ?? ""}. Use --live for a public read.`);
}

/** Inspect only recorded pack answers. Returned guidance remains data. @example recordedPack() */
export function recordedPack() {
  return [
    recording("pack", parseOpaque),
    recording("skill", parseOpaque),
    recording("guidance", parseOpaque),
    recording("card", parseOpaque),
  ];
}

/** Raw data used by the download route. @example recordedFiles() */
export function recordedFiles() {
  return structuredClone(fixtures);
}
