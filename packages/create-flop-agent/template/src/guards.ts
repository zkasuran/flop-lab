// SPDX-License-Identifier: Apache-2.0
import { parseFlop, parsePolicy } from "@flop-lab/spendguard";

export const HARD_MAX_FLOP = "1";
export const HEALTH_TTL_MS = 30_000;

/** Reject missing, stale or non-devnet service reports. Example: assertDevnet(health, at, now). */
export function assertDevnet(value: unknown, measuredAt: string, now: number): void {
  const health = object(value);
  const age = now - Date.parse(measuredAt);
  if (
    health.chain !== "FLOP Devnet" ||
    health.connected !== true ||
    health.syncing !== false ||
    !Number.isSafeInteger(health.peers) ||
    Number(health.peers) < 0 ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > HEALTH_TTL_MS
  )
    throw new Error("Devnet guard refused: need a fresh connected, nonsyncing FLOP Devnet report");
}

/** A minimal object boundary. Example: object(JSON.parse(raw)). */
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}

/** Select explicit served model names and miner addresses only. Example: discoverModels(response). */
export function discoverModels(value: unknown): { model: string; miners: string[] }[] {
  const rows = object(value).models;
  if (!Array.isArray(rows) || rows.length > 1_000) throw new Error("Invalid discovery models");
  const seen = new Set<string>();
  return rows.map((row) => {
    const model = object(row);
    if (
      typeof model.modelName !== "string" ||
      !/^[\w./-]{1,256}$/.test(model.modelName) ||
      typeof model.served !== "boolean" ||
      !Array.isArray(model.servingMiners) ||
      model.servingMiners.length > 10_000 ||
      model.servingMiners.some((m) => typeof m !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{47,48}$/.test(m))
    ) {
      throw new Error("Invalid discovery model or miners");
    }
    const id = model.modelName.toLowerCase();
    if (seen.has(id)) throw new Error("Duplicate discovery model");
    seen.add(id);
    return { model: id, miners: model.served ? (model.servingMiners as string[]) : [] };
  });
}

/** Pin every budget to the configured ceiling. Example: policyFor("0.1", model, miner). */
export function policyFor(maxFlop: string, model: string, miner: string) {
  const amount = parseFlop(maxFlop);
  if (amount === 0n || amount > parseFlop(HARD_MAX_FLOP))
    throw new Error("max-flop must be positive and at most 1 FLOP");
  return parsePolicy({
    version: 1,
    budgets: { task: maxFlop, hour: maxFlop, day: maxFlop, total: maxFlop },
    maxEscrowPerSession: maxFlop,
    maxPricePerGflop: "0.001",
    allowModels: [model],
    allowMiners: [miner],
    denyMiners: [],
    modelCaps: {},
    minerCaps: {},
    requireDryRun: true,
    cooldown: 1_000,
  });
}
