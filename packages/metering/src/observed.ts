// SPDX-License-Identifier: Apache-2.0
import { uint } from "./model";
export interface Observation {
  source: string;
  measuredAt: string;
  raw: string | null;
  error?: string;
}
export interface Snapshot {
  miners: Observation;
  stats: Observation;
}
export interface Miner {
  address: string;
  phase: string | null;
  gnMax: string | null;
  pledgeBaseline: string | null;
  efficiencyCoeff: number | null;
  baselineCheck: "MATCH" | "DRIFT" | "UNOBSERVABLE";
  leaseStatus: "UNOBSERVABLE";
  fields: string[];
}
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Expected an object");
  return v as Record<string, unknown>;
}
function text(v: unknown): string {
  if (typeof v !== "string" || !v.length || v.length > 256) throw Error("Invalid text");
  return v;
}
function integer(v: unknown): string {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return String(v);
  return uint(v).toString();
}
function read(o: Observation): Record<string, unknown> {
  if (!/^https:\/\//.test(text(o.source)) || !Number.isFinite(Date.parse(o.measuredAt)))
    throw Error("Invalid provenance");
  if (typeof o.raw !== "string") throw Error(o.error ?? "No data");
  if (o.raw.length > 200_000) throw Error("Observation too large");
  const root = obj(JSON.parse(o.raw));
  if (root.errors !== undefined || root.error !== undefined) throw Error("Source returned errors");
  return root;
}
/** Validate raw public observations. Missing lease anchors never become an Active model verdict.
 * @example auditSnapshot(snapshot).issue76.status // "UNOBSERVABLE"
 */
export function auditSnapshot(snapshot: Snapshot) {
  const errors: string[] = [],
    miners: Miner[] = [];
  let head: string | null = null,
    complete = false;
  try {
    head = integer(obj(read(snapshot.stats).stats).latestBlockNumber);
  } catch (e) {
    errors.push(`stats: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const root = read(snapshot.miners),
      page = obj(root.pagination);
    if (!Array.isArray(root.data) || root.data.length > 100) throw Error("Invalid bounded miner page");
    const total = BigInt(integer(page.total));
    if (
      integer(page.offset) !== "0" ||
      total < root.data.length ||
      typeof page.hasMore !== "boolean" ||
      page.hasMore !== total > root.data.length
    )
      throw Error("Inconsistent pagination");
    const parsed = root.data.map((value) => {
      const row = obj(value),
        address = text(row.address);
      if (!/^[1-9A-HJ-NP-Za-km-z]{40,64}$/.test(address)) throw Error("Invalid address syntax");
      if (row.calibration == null)
        return {
          address,
          phase: null,
          gnMax: null,
          pledgeBaseline: null,
          efficiencyCoeff: null,
          baselineCheck: "UNOBSERVABLE",
          leaseStatus: "UNOBSERVABLE",
          fields: [],
        } satisfies Miner;
      const c = obj(row.calibration),
        gnMax = integer(c.gnMax),
        pledgeBaseline = integer(c.pledgeBaseline);
      if (typeof c.efficiencyCoeff !== "number" || !Number.isFinite(c.efficiencyCoeff) || c.efficiencyCoeff < 0)
        throw Error("Invalid efficiency coefficient");
      return {
        address,
        phase: text(c.phase),
        gnMax,
        pledgeBaseline,
        efficiencyCoeff: c.efficiencyCoeff,
        baselineCheck: BigInt(gnMax) * 86_400n === BigInt(pledgeBaseline) ? "MATCH" : "DRIFT",
        leaseStatus: "UNOBSERVABLE",
        fields: Object.keys(c).sort(),
      } satisfies Miner;
    });
    if (new Set(parsed.map((r) => r.address)).size !== parsed.length) throw Error("Duplicate miner addresses");
    miners.push(...parsed);
    complete = total === BigInt(parsed.length);
  } catch (e) {
    errors.push(`miners: ${e instanceof Error ? e.message : String(e)}`);
  }
  return {
    head,
    miners,
    complete,
    errors,
    sources: [snapshot.miners, snapshot.stats].map(({ source, measuredAt }) => ({ source, measuredAt })),
    issue76: {
      status: "UNOBSERVABLE",
      source: "https://github.com/flop-labs/network/issues/76",
      reason:
        "No authenticated current acceptance block, lease parameter or same-head storage proof. Neither reproduced nor shown fixed by this observation.",
    },
  };
}
