// SPDX-License-Identifier: Apache-2.0
import {
  evaluate,
  formatFlop,
  parseFlop,
  parsePolicy,
  parseRequest,
  type Decision,
  type Policy,
  type Reservation,
  type SpendRequest,
} from "./policy";

export interface ReplayRow {
  id: string;
  agent: string;
  at: number;
  model: string | null;
  miner: string;
  amount: string;
  pricePerGflop: string;
}
export interface ReplayTape {
  source: string;
  measuredAt: string;
  kind: "settlements" | "sdk-estimate";
  assumptions: string[];
  rows: ReplayRow[];
  partial: boolean;
}
export interface ReplayTotal {
  allowed: number;
  refused: number;
  skipped: number;
  allowedFlop: string;
  refusedFlop: string;
  skippedFlop: string;
}
export interface ReplayDecision {
  row: ReplayRow;
  status: "allow" | "deny" | "skipped";
  reason: string[];
  decision: Decision | null;
  totals: ReplayTotal;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a recording object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new Error("Invalid recording text");
  return value;
}
function rawUnits(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value) || value.length > 256)
    throw new Error("Invalid raw amount");
  return BigInt(value);
}
function timestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000)
    throw new Error("Invalid recording timestamp");
  return value;
}
function provenance(value: Record<string, unknown>) {
  const source = text(value.source),
    measuredAt = text(value.measuredAt);
  if (!Number.isFinite(Date.parse(measuredAt))) throw new Error("Invalid measurement time");
  return { source, measuredAt };
}

/** Read a captured MCP settlement page. Prices are fractional raw units, rounded up to one raw unit.
 * @example settlementTape(JSON.parse(recording))
 */
export function settlementTape(input: unknown): ReplayTape {
  const record = object(input),
    meta = provenance(record);
  if (meta.source !== "https://mcp.flop.network/mcp" || record.tool !== "flop_list_settlements")
    throw new Error("Unexpected settlement source");
  if (typeof record.raw !== "string" || record.raw.length > 200_000) throw new Error("Invalid raw recording");
  const page = object(JSON.parse(record.raw) as unknown),
    pagination = object(page.pagination);
  if (!Array.isArray(page.data) || page.data.length > 1000 || typeof pagination.hasMore !== "boolean")
    throw new Error("Invalid settlement page");
  for (const key of ["total", "limit", "offset"])
    if (!Number.isSafeInteger(pagination[key]) || Number(pagination[key]) < 0) throw new Error("Invalid pagination");
  if (Number(pagination.total) < page.data.length + Number(pagination.offset))
    throw new Error("Inconsistent pagination");
  const ids = new Set<string>();
  const rows = page.data.map((value): ReplayRow => {
    const row = object(value),
      id = text(row.channelId);
    if (!/^0x[a-f\d]{64}$/i.test(id) || ids.has(id)) throw new Error("Invalid or duplicate channel ID");
    ids.add(id);
    const escrow = rawUnits(row.escrow);
    if (rawUnits(row.minerPaid) + rawUnits(row.burned) + rawUnits(row.unusedEscrow) !== escrow)
      throw new Error("Escrow split does not conserve");
    const price = text(row.pricePerGflop);
    // The MCP field is raw units/GFLOP, unlike the policy's FLOP/GFLOP.
    parseFlop(price);
    const [whole = "0", fraction = ""] = price.split(".");
    const rounded = BigInt(whole) + (/[1-9]/.test(fraction) ? 1n : 0n);
    const at = timestamp(row.settledAt);
    if (at > Date.parse(meta.measuredAt)) throw new Error("Settlement is later than capture");
    return {
      id,
      agent: text(row.agent),
      at,
      model: row.modelHash === null || row.modelHash === undefined ? null : text(row.modelHash),
      miner: text(row.miner),
      amount: formatFlop(escrow),
      pricePerGflop: formatFlop(rounded),
    };
  });
  return {
    ...meta,
    kind: "settlements",
    partial: pagination.hasMore || Number(pagination.offset) !== 0 || Number(pagination.total) !== rows.length,
    rows,
    assumptions: [
      "Counterfactual from an empty ledger. Settlement time stands in for unknown admission time.",
      "Model hashes are exact policy identities. One synthetic task per recorded agent. Preflight is assumed.",
      "Full escrow stays pending. No refund or finality is inferred. Fractional raw-unit prices round upwards.",
    ],
  };
}

/** Replay a real SDK estimator recording using explicit scenario identities. @example estimateTape(record, { agent: "demo", model: "model", miner: "miner" }) */
export function estimateTape(input: unknown, binding: { agent: string; model: string; miner: string }): ReplayTape {
  const record = object(input),
    meta = provenance(record),
    output = object(record.output),
    estimate = object(record.input);
  if (meta.source !== "https://registry.npmjs.org/@flop-labs/sdk/-/sdk-0.4.0.tgz")
    throw new Error("Unexpected estimator source");
  const price = text(estimate.flopPerGn);
  parseFlop(price);
  const escrow = rawUnits(output.escrowRaw),
    cost = rawUnits(output.costRaw);
  if (cost > escrow || !Array.isArray(output.channels) || !output.channels.length)
    throw new Error("Invalid estimate totals");
  let channelEscrow = 0n,
    channelCost = 0n;
  const rows = output.channels.map((value, index): ReplayRow => {
    const channel = object(value),
      amount = rawUnits(channel.escrowRaw),
      charge = rawUnits(channel.costRaw);
    if (charge > amount) throw new Error("Estimate cost exceeds escrow");
    channelEscrow += amount;
    channelCost += charge;
    return {
      id: `sdk-estimate-${index}`,
      at: Date.parse(meta.measuredAt),
      agent: text(binding.agent),
      model: text(binding.model),
      miner: text(binding.miner),
      amount: formatFlop(amount),
      pricePerGflop: price,
    };
  });
  if (channelEscrow !== escrow || channelCost !== cost) throw new Error("Estimate channels do not match totals");
  return {
    ...meta,
    kind: "sdk-estimate",
    rows,
    partial: false,
    assumptions: [
      "Actual SDK output for synthetic architecture, token, calibration and price inputs. No measured execution cost.",
      "Agent, model and miner bindings are chosen scenario labels. Preflight is assumed. Full estimated escrow stays pending.",
    ],
  };
}

/** Replay a chronological prefix using exact escrow totals. Missing models are skipped, never allowed.
 * @example replayTape(policy, tape, tape.rows.length)
 */
export function replayTape(
  policy: Policy,
  tape: ReplayTape,
  count = tape.rows.length,
): { steps: ReplayDecision[]; totals: ReplayTotal } {
  const p = parsePolicy(policy);
  provenance(tape as unknown as Record<string, unknown>);
  if (
    !Array.isArray(tape.rows) ||
    tape.rows.length > 1000 ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > tape.rows.length
  )
    throw new Error("Invalid replay position or size");
  const ids = new Set<string>();
  const rows = tape.rows
    .map((row) => {
      text(row.id);
      text(row.agent);
      text(row.miner);
      timestamp(row.at);
      parseFlop(row.amount);
      parseFlop(row.pricePerGflop);
      if (row.model !== null) text(row.model);
      if (ids.has(row.id)) throw new Error("Duplicate replay ID");
      ids.add(row.id);
      return row;
    })
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ledger: Reservation[] = [];
  const steps: ReplayDecision[] = [];
  let allowed = 0,
    refused = 0,
    skipped = 0,
    acceptedRaw = 0n,
    refusedRaw = 0n,
    skippedRaw = 0n;
  const totals = (): ReplayTotal => ({
    allowed,
    refused,
    skipped,
    allowedFlop: formatFlop(acceptedRaw),
    refusedFlop: formatFlop(refusedRaw),
    skippedFlop: formatFlop(skippedRaw),
  });
  for (const row of rows.slice(0, count)) {
    const amount = parseFlop(row.amount);
    if (row.model === null || amount === 0n) {
      skipped++;
      skippedRaw += amount;
      steps.push({
        row,
        status: "skipped",
        reason: [row.model === null ? "Missing model identity" : "Zero escrow cannot represent a spend request"],
        decision: null,
        totals: totals(),
      });
      continue;
    }
    const request: SpendRequest = parseRequest({
      id: row.id,
      task: row.agent,
      model: row.model,
      miner: row.miner,
      amount: row.amount,
      pricePerGflop: row.pricePerGflop,
      at: row.at,
      dryRun: true,
    });
    const decision = evaluate(p, ledger, request);
    if (decision.decision === "allow") {
      ledger.push({ request, charged: amount.toString(), pending: true });
      allowed++;
      acceptedRaw += amount;
    } else {
      refused++;
      refusedRaw += amount;
    }
    steps.push({ row, status: decision.decision, reason: decision.fired, decision, totals: totals() });
  }
  return { steps, totals: totals() };
}
