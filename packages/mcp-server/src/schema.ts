// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

export const text = z.string().min(1).max(4000);
export const date = z.iso.datetime();
export const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const decimal = z
  .string()
  .max(256)
  .regex(/^(0|[1-9]\d*)(?:\.\d{1,18})?$/);
export const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const mode = z.enum(["live", "recorded"]).default("live");
export const provenance = z.strictObject({ source: text, measuredAt: date });
export const check = z.strictObject({
  id: text,
  status: z.enum(["PASS", "FAIL", "UNVERIFIABLE", "NOT_APPLICABLE"]),
  detail: text,
});
export const request = z.strictObject({
  id: text,
  task: text,
  model: text,
  miner: text,
  amount: decimal,
  pricePerGflop: decimal,
  at: count,
  dryRun: z.boolean(),
});
const budgets = z.strictObject({ task: decimal, hour: decimal, day: decimal, total: decimal });
export const policy = z.strictObject({
  version: z.literal(1),
  budgets,
  maxPricePerGflop: decimal,
  maxEscrowPerSession: decimal,
  allowModels: z.array(text).max(100),
  allowMiners: z.array(text).max(100),
  denyMiners: z.array(text).max(100),
  modelCaps: z.record(text, decimal),
  minerCaps: z.record(text, decimal),
  requireDryRun: z.boolean(),
  cooldown: count,
});
export const reservation = z.strictObject({
  request,
  charged: z.string().max(256).regex(/^\d+$/),
  pending: z.boolean(),
});
const budgetResult = z.strictObject({ used: decimal, limit: decimal, remaining: decimal });
export const decision = z.strictObject({
  decision: z.enum(["allow", "deny"]),
  rules: z.array(z.strictObject({ rule: text, passed: z.boolean(), detail: text })),
  fired: z.array(text),
  budgets: z.strictObject({ task: budgetResult, hour: budgetResult, day: budgetResult, total: budgetResult }),
});

/** Wrap a tool-specific result in dated execution and source metadata. @example envelope(check) */
export function envelope<T extends z.ZodType>(data: T) {
  return z.strictObject({
    tool: text,
    mode: z.enum(["live", "recorded", "local"]),
    executedAt: date,
    evidence: z.array(provenance).min(1).max(2000),
    cacheHit: z.boolean(),
    requests: count,
    data,
    limitations: z.array(text).min(1),
  });
}

export type Evidence = z.infer<typeof provenance>;
export type Mode = "live" | "recorded" | "local";
export type ResultData = { data: unknown; evidence: Evidence[]; mode: Mode; limitations: string[] };
