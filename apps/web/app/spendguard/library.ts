// SPDX-License-Identifier: Apache-2.0
// Import only the browser-safe policy module, never the Node ledger or SDK.
import {
  evaluate,
  formatFlop,
  parseFlop,
  parsePolicyText,
  type Decision,
  type Policy,
  type Reservation,
  type SpendRequest,
} from "../../../../packages/spendguard/src/policy";

export { formatFlop, parseFlop, parsePolicyText };
export type { Policy, Decision };
export interface CatalogSeed {
  model: string;
  miner: string;
  measuredAt: string;
  source: string;
  expiresAt: string;
  priceSource: string;
}
export interface ScenarioStep {
  title: string;
  request: SpendRequest;
}
export interface ReplayStep extends ScenarioStep {
  result: Decision;
  reservedAfter: string;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid catalogue object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new Error("Invalid catalogue text");
  return value;
}
function date(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error("Invalid catalogue date");
  return result;
}

/** Extract one recorded identity without treating gateway token pricing as GFLOP pricing. @example catalogSeed(recording) */
export function catalogSeed(recording: unknown): CatalogSeed | null {
  const record = object(recording);
  if (record.source !== "https://api.flop.network/v1/models" || record.status !== 200)
    throw new Error("Unexpected catalogue source or HTTP status");
  const measuredAt = date(record.measuredAt);
  if (typeof record.raw !== "string" || record.raw.length > 200_000) throw new Error("Invalid catalogue size");
  const data = object(JSON.parse(record.raw) as unknown).data;
  if (!Array.isArray(data) || data.length > 1000) throw new Error("Invalid model list");
  let seed: CatalogSeed | null = null;
  for (const entry of data) {
    const row = object(entry);
    const model = text(row.id);
    const sources = object(row["x-flop"]).price_sources;
    if (!Array.isArray(sources) || sources.length > 1000) throw new Error("Invalid price source list");
    for (const entry of sources) {
      const source = object(entry);
      const miner = text(source.miner_address);
      if (!/^[1-9A-HJ-NP-Za-km-z]{46,50}$/.test(miner)) throw new Error("Invalid miner address shape");
      const expiresAt = date(source.expires_at);
      if (Date.parse(expiresAt) <= Date.parse(date(source.effective_at))) throw new Error("Invalid source window");
      const priceSource = text(source.source);
      seed ??= { model, miner, measuredAt, source: record.source, expiresAt, priceSource };
    }
  }
  return seed;
}

/** Generate editable, explicitly synthetic limits around recorded identities. @example initialPolicy(seed) */
export function initialPolicy(seed: CatalogSeed): string {
  return `# Scripted limits, not observed prices.
version: 1
budgets:
  task: "0.03"
  hour: "0.05"
  day: "0.2"
  total: "1"
maxPricePerGflop: "0.001"
maxEscrowPerSession: "0.02"
allowModels: [${JSON.stringify(seed.model)}]
allowMiners: [${JSON.stringify(seed.miner)}]
denyMiners: ["blocked-demo-miner"]
modelCaps: {}
minerCaps: {}
requireDryRun: true
cooldown: 1000
`;
}

/** Script requests without signing or querying a wallet. Times are simulated offsets. @example scenario(seed) */
export function scenario(seed: CatalogSeed): ScenarioStep[] {
  const base = {
    task: "draft",
    model: seed.model,
    miner: seed.miner,
    amount: "0.01",
    pricePerGflop: "0.001",
    dryRun: true,
  };
  const inputs = [
    { title: "Draft: first pass", patch: {} },
    { title: "Draft: use the task budget", patch: { amount: "0.02" } },
    { title: "Draft: one request too far", patch: {} },
    { title: "Review: another task", patch: { task: "review", amount: "0.02" } },
    { title: "Review: higher quote", patch: { task: "review", pricePerGflop: "0.002" } },
    { title: "Blocked miner, no preflight", patch: { task: "review", miner: "blocked-demo-miner", dryRun: false } },
  ];
  return inputs.map(({ title, patch }, index) => ({
    title,
    request: { ...base, ...patch, id: `script-${index + 1}`, at: Date.parse(seed.measuredAt) + index * 2000 },
  }));
}

/** Replay an admitted prefix from an empty in-memory ledger. Denials reserve nothing. @example replay(policy, steps, 2) */
export function replay(policy: Policy, steps: readonly ScenarioStep[], count: number) {
  if (!Number.isSafeInteger(count) || count < 0 || count > steps.length) throw new Error("Invalid replay position");
  const ledger: Reservation[] = [];
  const decisions: ReplayStep[] = [];
  for (const step of steps.slice(0, count)) {
    const result = evaluate(policy, ledger, step.request);
    if (result.decision === "allow")
      ledger.push({ request: step.request, charged: parseFlop(step.request.amount).toString(), pending: true });
    decisions.push({
      ...step,
      result,
      reservedAfter: formatFlop(ledger.reduce((sum, entry) => sum + BigInt(entry.charged), 0n)),
    });
  }
  const current = steps[Math.max(0, count - 1)];
  if (!current) throw new Error("No scripted requests");
  // Only use the budget projection here. This probe never admits or records a request.
  const budgets = evaluate(policy, ledger, current.request).budgets;
  return { decisions, ledger, budgets, task: current.request.task };
}

/** Normalize exact amounts for a visual transform only. The displayed amount stays exact. @example fillRatio("0.01", "0.03") */
export function fillRatio(used: string, limit: string): number {
  const cap = parseFlop(limit);
  const value = parseFlop(used);
  if (cap === 0n) return value > 0n ? 1 : 0;
  return Number((value * 10_000n) / cap > 10_000n ? 10_000n : (value * 10_000n) / cap) / 10_000;
}
