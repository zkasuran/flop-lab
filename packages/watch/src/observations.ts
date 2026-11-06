// SPDX-License-Identifier: Apache-2.0
import { parseStats, parseSettlement, parseIndexerData } from "@flop-lab/mcp";
import { parseGateway } from "@flop-lab/models";
import { parseReport } from "@flop-lab/harness";
import { array, integer, object, text, time } from "./config";

export type Key = "stats" | "models" | "settlements" | "channels" | `harness:${string}`;
export type Observation = {
  key: Key;
  source: string;
  measuredAt: string;
  raw: string | null;
  status: "ok" | "down" | "unknown" | "budget";
  error: string | null;
};
export type Sample = {
  version: 1;
  startedAt: string;
  finishedAt: string;
  requests: number;
  observations: Observation[];
};
export function settlementPage(raw: string) {
  const o = object(JSON.parse(raw)),
    p = object(o.pagination);
  if (typeof p.hasMore !== "boolean") throw new Error("Invalid page coverage");
  integer(p.total);
  integer(p.offset);
  integer(p.limit);
  const rows = array(o.data).map(parseSettlement);
  for (const row of rows) {
    integer(row.settledBlock);
    integer(row.settledAt);
    if (!/^0x[\da-f]{64}$/i.test(row.channelId)) throw new Error("Invalid channel ID");
  }
  return { rows, hasMore: p.hasMore };
}
export function channels(raw: string) {
  return parseIndexerData("computeChannels", JSON.parse(raw));
}
/** Validate source payloads through the suite's schemas. @example validateObservation(observation) */
export function validateObservation(o: Observation): void {
  time(o.measuredAt);
  text(o.source);
  if (o.status !== "ok") return;
  if (o.raw === null) throw new Error("Successful observation has no payload");
  if (o.key === "stats") integer(parseStats(JSON.parse(o.raw)).latestBlockNumber);
  else if (o.key === "models") parseGateway(JSON.parse(o.raw));
  else if (o.key === "settlements") settlementPage(o.raw);
  else if (o.key === "channels") channels(o.raw);
  else if (o.key.startsWith("harness:")) parseReport(JSON.parse(o.raw));
  else throw new Error("Unknown observation key");
}
/** Validate a recorded poll before replay. @example parseSample(JSON.parse(raw)) */
export function parseSample(v: unknown): Sample {
  const s = object(v);
  if (s.version !== 1) throw new Error("Unsupported sample version");
  const sample: Sample = {
    version: 1,
    startedAt: time(s.startedAt),
    finishedAt: time(s.finishedAt),
    requests: integer(s.requests),
    observations: array(s.observations, 100).map((v) => {
      const o = object(v),
        key = text(o.key) as Key;
      if (!["stats", "models", "settlements", "channels"].includes(key) && !key.startsWith("harness:"))
        throw new Error("Unknown observation key");
      if (!["ok", "down", "unknown", "budget"].includes(String(o.status)))
        throw new Error("Invalid observation status");
      if (o.raw !== null && (typeof o.raw !== "string" || new TextEncoder().encode(o.raw).length > 196_608))
        throw new Error("Invalid raw response");
      const observation: Observation = {
        key,
        source: text(o.source),
        measuredAt: time(o.measuredAt),
        raw: o.raw as string | null,
        status: o.status as Observation["status"],
        error: o.error === null ? null : text(o.error),
      };
      validateObservation(observation);
      return observation;
    }),
  };
  if (
    sample.startedAt > sample.finishedAt ||
    sample.observations.some((o) => o.measuredAt < sample.startedAt || o.measuredAt > sample.finishedAt)
  )
    throw new Error("Observation outside poll interval");
  if (new Set(sample.observations.map((o) => o.key)).size !== sample.observations.length)
    throw new Error("Duplicate observation key");
  return sample;
}
