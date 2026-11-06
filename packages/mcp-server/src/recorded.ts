// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { pickResponse } from "@flop-lab/mcp";
import { parseSnapshot } from "@flop-lab/scoreboard";
import { parseObservation } from "@flop-lab/did";
import { parseEvidence } from "@flop-lab/verifier";
import { parseSnapshot as parseIndexer } from "@flop-lab/indexer-audit";
import { analyze, parseTools, type Trace } from "@flop-lab/mcpaudit";
import { provenance } from "./schema";
import { parseRun } from "@flop-lab/status";

// Fixed package paths only. These resolve identically from src/ and dist/.
const root = new URL("../../", import.meta.url);
function read(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, root), "utf8")) as unknown;
}

/** Read a named suite fixture through its package parser. @example recordedChannel().channelId */
export function recordedChannel() {
  return parseEvidence(read("verifier/fixtures/v2-channel.json"));
}
/** Replay the scoreboard capture without refreshing its time. @example recordedScore().measuredAt */
export function recordedScore() {
  return parseSnapshot(read("scoreboard/fixtures/snapshot-04.json"));
}
/** Read the bounded indexer recording. @example recordedIndexer().limit */
export function recordedIndexer() {
  return parseIndexer(read("indexer-audit/fixtures/devnet.json"));
}

/** Read the newly landed status package's retained probe runs. @example recordedStatus()[0]?.observer */
export function recordedStatus() {
  return ["2026-11-06T05-23-46.400Z", "2026-11-06T05-29-43.883Z"].map((id) =>
    parseRun(read(`status/test/fixtures/${id}/run.json`)),
  );
}

/** Read the dated local probe recording without executing probes. @example recordedDoctor().status */
export function recordedDoctor() {
  return z
    .object({
      role: z.enum(["miner", "validator"]),
      measuredAt: z.iso.datetime(),
      status: z.enum(["READY", "NOT_READY", "UNKNOWN"]),
      requirements: z.array(
        z.object({ id: z.string(), status: z.enum(["READY", "NOT_READY", "UNKNOWN"]), detail: z.string() }),
      ),
    })
    .parse(read("mcp-server/fixtures/doctor.json"));
}

/** Load the recorded settlement observation for arithmetic checks. @example recordedSettlements().rows */
export function recordedSettlements() {
  const record = z.object({ ...provenance.shape, raw: z.string() }).parse(read("verifier/fixtures/settlements-0.json"));
  const page = z
    .object({
      data: z.array(z.record(z.string(), z.unknown())),
      pagination: z.object({ hasMore: z.boolean(), total: z.number().int().nonnegative() }),
    })
    .parse(JSON.parse(record.raw));
  return {
    evidence: [{ source: record.source, measuredAt: record.measuredAt }],
    rows: page.data,
    complete: !page.pagination.hasMore,
    total: page.pagination.total,
  };
}

/** Read fixed DID recordings with URL matching. Missing URLs stay unavailable. @example await recordedDidReader(url) */
export async function recordedDidReader(url: string) {
  for (const name of ["note-sharded", "note-legacy", "note-agent", "room", "github", "build", "attestation-room"]) {
    const observation = parseObservation(read(`did/fixtures/${name}.json`));
    if (observation.source === url) return observation;
  }
  throw new Error("URL is outside the bundled DID capture");
}

/** Audit the recorded knowledge response against its recorded declaration. @example recordedContract().observation.status */
export function recordedContract() {
  const traceSchema = z.object({
    id: z.number(),
    source: z.string(),
    measuredAt: z.string(),
    durationMs: z.number(),
    status: z.number(),
    bytes: z.number(),
    raw: z.string(),
    truncated: z.boolean(),
    request: z.object({
      jsonrpc: z.string(),
      id: z.number(),
      method: z.string(),
      params: z.object({ name: z.string(), arguments: z.unknown() }).optional(),
    }),
  });
  const list = traceSchema.parse(read("mcpaudit/fixtures/audit-1.json"));
  const tools = parseTools(pickResponse(list.raw, list.request.id).result);
  // Capture IDs are discovered once from the existing suite fixture manifest.
  const candidates = ["audit-87"];
  for (const name of candidates) {
    const trace = traceSchema.parse(read(`mcpaudit/fixtures/${name}.json`)) as Trace;
    if (trace.request.params?.name !== "flop_knowledge_get") continue;
    const tool = tools.find((item) => item.name === "flop_knowledge_get");
    if (!tool) throw new Error("Recorded tool declaration is absent");
    return {
      observation: analyze(tool, { label: "minimal", args: trace.request.params.arguments }, trace),
      evidence: [list, trace].map(({ source, measuredAt }) => ({ source, measuredAt })),
    };
  }
  throw new Error("Knowledge audit recording is absent");
}

/** Fixed fixture directory used to load the harness claim catalogue. @example claimDirectory().protocol */
export function claimDirectory() {
  return new URL("harness/claims/", root);
}
/** Absolute path to the package used by local disk diagnostics. @example localDiskPath() */
export function localDiskPath() {
  return fileURLToPath(new URL("../", import.meta.url));
}
