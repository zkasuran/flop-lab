// SPDX-License-Identifier: Apache-2.0
export const UNIT = 10n ** 18n;
const DECIMAL = /^(0|[1-9]\d*)(?:\.\d{1,18})?$/;
export type Budget = "task" | "hour" | "day" | "total";
export interface Policy {
  version: 1;
  budgets: Record<Budget, string>;
  maxPricePerGflop: string;
  maxEscrowPerSession: string;
  allowModels: string[];
  allowMiners: string[];
  denyMiners: string[];
  modelCaps: Record<string, string>;
  minerCaps: Record<string, string>;
  requireDryRun: boolean;
  /** Minimum milliseconds between admitted requests, across all tasks. */
  cooldown: number;
}
export interface SpendRequest {
  id: string;
  task: string;
  model: string;
  miner: string;
  /** Plain decimal FLOP. This is the full amount at risk, not an average cost. */
  amount: string;
  pricePerGflop: string;
  at: number;
  dryRun: boolean;
}
export interface Reservation {
  request: SpendRequest;
  /** Net amount still charged, in raw units. */
  charged: string;
  /** Unresolved reservations never age out of rolling budgets. */
  pending: boolean;
}
export interface RuleTrace {
  rule: string;
  passed: boolean;
  detail: string;
}
export interface Decision {
  decision: "allow" | "deny";
  rules: RuleTrace[];
  fired: string[];
  budgets: Record<Budget, { used: string; limit: string; remaining: string }>;
}

/** Convert decimal FLOP exactly. Numbers and exponent notation are rejected. @example parseFlop("0.01") */
export function parseFlop(value: unknown): bigint {
  if (typeof value !== "string" || value.length > 256 || !DECIMAL.test(value))
    throw new Error("FLOP must be a non-negative decimal string with at most 18 places");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * UNIT + BigInt(fraction.padEnd(18, "0"));
}
/** Format raw units without floating point. @example formatFlop(1n) */
export function formatFlop(raw: bigint): string {
  if (raw < 0n) throw new Error("Negative FLOP");
  const fraction = (raw % UNIT).toString().padStart(18, "0").replace(/0+$/, "");
  return `${raw / UNIT}${fraction ? `.${fraction}` : ""}`;
}
function object(v: unknown, label: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`${label} must be an object`);
  return v as Record<string, unknown>;
}
function keys(o: Record<string, unknown>, expected: string[]) {
  if (Object.keys(o).some((k) => !expected.includes(k)) || expected.some((k) => !Object.hasOwn(o, k)))
    throw new Error(`Expected exactly: ${expected.join(", ")}`);
}
function text(v: unknown): asserts v is string {
  if (typeof v !== "string" || !v.trim() || v.length > 256)
    throw new Error("Expected nonempty text up to 256 characters");
}
/** Validate untrusted JSON or parsed YAML. Unknown keys fail closed. @example parsePolicy(JSON.parse(input)) */
export function parsePolicy(value: unknown): Policy {
  const p = object(value, "policy");
  keys(p, [
    "version",
    "budgets",
    "maxPricePerGflop",
    "maxEscrowPerSession",
    "allowModels",
    "allowMiners",
    "denyMiners",
    "modelCaps",
    "minerCaps",
    "requireDryRun",
    "cooldown",
  ]);
  if (
    p.version !== 1 ||
    typeof p.requireDryRun !== "boolean" ||
    !Number.isSafeInteger(p.cooldown) ||
    Number(p.cooldown) < 0
  )
    throw new Error("Invalid version, requireDryRun or cooldown");
  const budgets = object(p.budgets, "budgets");
  keys(budgets, ["task", "hour", "day", "total"]);
  Object.values(budgets).forEach(parseFlop);
  parseFlop(p.maxPricePerGflop);
  parseFlop(p.maxEscrowPerSession);
  for (const key of ["allowModels", "allowMiners", "denyMiners"] as const) {
    const list = p[key];
    if (!Array.isArray(list)) throw new Error(`${key} must be a list`);
    list.forEach(text);
    if (new Set(list).size !== list.length) throw new Error(`${key} contains duplicates`);
  }
  for (const key of ["modelCaps", "minerCaps"] as const) {
    for (const [name, amount] of Object.entries(object(p[key], key))) {
      text(name);
      parseFlop(amount);
    }
  }
  return structuredClone(p) as unknown as Policy;
}
/**
 * Read JSON or the policy's small YAML subset: mappings, block lists and JSON inline values.
 * Tabs, duplicate block-mapping keys, anchors, tags and multiline scalars are refused.
 * @example parsePolicyText(documentText)
 */
export function parsePolicyText(input: string): Policy {
  return parsePolicy(parsePolicyDocument(input));
}

/** Decode policy text before schema validation, for lint diagnostics. @example parsePolicyDocument(text) */
export function parsePolicyDocument(input: string): unknown {
  if (typeof input !== "string" || input.length > 65_536)
    throw new Error("Policy text must fit within 65536 characters");
  if (input.trimStart().startsWith("{")) return JSON.parse(input) as unknown;
  const lines = input.split(/\r?\n/);
  if (lines.length > 512) throw new Error("Policy text must fit within 512 lines");
  const result: Record<string, unknown> = Object.create(null);
  let section: unknown;
  const scalar = (text: string): unknown => {
    if (!text) throw new Error("Missing scalar value");
    if (/^'(?:[^']|'')*'$/.test(text)) return text.slice(1, -1).replace(/''/g, "'");
    if (/^["[{]/.test(text)) {
      try {
        return JSON.parse(text) as unknown;
      } catch (error) {
        throw new Error("Quoted strings and inline lists or maps must use JSON syntax", { cause: error });
      }
    }
    if (/^[&*!|>]/.test(text) || text.includes(" #") || text.includes(": "))
      throw new Error("YAML anchors, tags, multiline values and inline comments are not supported");
    if (text === "true") return true;
    if (text === "false") return false;
    if (text === "null" || text === "~") return null;
    if (/^-?(0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return Number(text);
    return text;
  };
  const mapping = (text: string): [string, string] => {
    const match = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:]+):(?: +(.*))?$/.exec(text);
    if (!match?.[1]) throw new Error("Expected key: value");
    const raw = match[1].trim();
    const key = /^["']/.test(raw) ? scalar(raw) : raw;
    if (typeof key !== "string" || !key) throw new Error("Mapping keys must be nonempty strings");
    return [key, match[2]?.trim() ?? ""];
  };
  const set = (target: Record<string, unknown>, key: string, value: unknown) => {
    if (Object.hasOwn(target, key)) throw new Error(`Duplicate policy key: ${key}`);
    Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
  };
  for (const [index, line] of lines.entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    try {
      if (line.includes("\t")) throw new Error("Use spaces instead of tabs");
      const indent = line.length - line.trimStart().length;
      const text = line.trim();
      if (indent === 0) {
        const [key, value] = mapping(text);
        const parsed = value
          ? scalar(value)
          : ["allowModels", "allowMiners", "denyMiners"].includes(key)
            ? []
            : (Object.create(null) as Record<string, unknown>);
        set(result, key, parsed);
        section = value ? undefined : parsed;
      } else if (indent === 2 && Array.isArray(section)) {
        if (!text.startsWith("- ")) throw new Error("Expected a block-list item: - value");
        section.push(scalar(text.slice(2).trim()));
      } else if (indent === 2 && section && typeof section === "object") {
        const [key, value] = mapping(text);
        set(section as Record<string, unknown>, key, scalar(value));
      } else throw new Error("Policy mappings and lists use exactly two spaces of indentation");
    } catch (error) {
      throw new Error(`Policy YAML line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }
  return result;
}

/** Validate a spend request at an input boundary. @example parseRequest(JSON.parse(input)) */
export function parseRequest(value: unknown): SpendRequest {
  const r = object(value, "request");
  keys(r, ["id", "task", "model", "miner", "amount", "pricePerGflop", "at", "dryRun"]);
  for (const key of ["id", "task", "model", "miner"]) text(r[key]);
  if (parseFlop(r.amount) === 0n) throw new Error("Amount must be positive");
  parseFlop(r.pricePerGflop);
  if (
    !Number.isSafeInteger(r.at) ||
    Number(r.at) < 0 ||
    Number(r.at) > 8_640_000_000_000_000 ||
    typeof r.dryRun !== "boolean"
  )
    throw new Error("Invalid timestamp or dryRun");
  return structuredClone(r) as unknown as SpendRequest;
}
/**
 * Evaluate every rule without changing the ledger. Ledger ordering never changes a result.
 * Rolling windows are (now - window, now]. Empty allowlists deny everything.
 * @example evaluate(policy, [], request).decision
 */
export function evaluate(policy: Policy, ledger: readonly Reservation[], request: SpendRequest): Decision {
  const p = parsePolicy(policy);
  const r = parseRequest(request);
  const seen = new Set<string>();
  for (const entry of ledger) {
    parseRequest(entry.request);
    if (
      typeof entry.charged !== "string" ||
      !/^(0|[1-9]\d*)$/.test(entry.charged) ||
      entry.charged.length > 274 ||
      BigInt(entry.charged) > parseFlop(entry.request.amount) ||
      typeof entry.pending !== "boolean" ||
      seen.has(entry.request.id)
    )
      throw new Error("Invalid ledger reservation");
    seen.add(entry.request.id);
  }
  const amount = parseFlop(r.amount);
  const sum = (predicate: (entry: Reservation) => boolean) =>
    ledger.filter(predicate).reduce((n, e) => n + BigInt(e.charged), 0n);
  const used: Record<Budget, bigint> = {
    task: sum((e) => e.request.task === r.task),
    hour: sum((e) => e.pending || e.request.at > r.at - 3_600_000),
    day: sum((e) => e.pending || e.request.at > r.at - 86_400_000),
    total: sum(() => true),
  };
  const rules: RuleTrace[] = [];
  const add = (rule: string, passed: boolean, detail: string) => rules.push({ rule, passed, detail });
  add("uniqueId", !seen.has(r.id), "Request IDs cannot be reused");
  add(
    "clock",
    ledger.every((e) => e.request.at <= r.at),
    "Clock must not move behind an admitted request",
  );
  const budgets = {} as Decision["budgets"];
  for (const key of ["task", "hour", "day", "total"] as const) {
    const limit = parseFlop(p.budgets[key]);
    const remaining = limit > used[key] ? limit - used[key] : 0n;
    budgets[key] = { used: formatFlop(used[key]), limit: formatFlop(limit), remaining: formatFlop(remaining) };
    add(
      `budget.${key}`,
      used[key] + amount <= limit,
      `${formatFlop(used[key])} + ${r.amount} <= ${p.budgets[key]} FLOP`,
    );
  }
  add(
    "maxPricePerGflop",
    parseFlop(r.pricePerGflop) <= parseFlop(p.maxPricePerGflop),
    `${r.pricePerGflop} <= ${p.maxPricePerGflop} FLOP/GFLOP`,
  );
  add(
    "maxEscrowPerSession",
    amount <= parseFlop(p.maxEscrowPerSession),
    `${r.amount} <= ${p.maxEscrowPerSession} FLOP`,
  );
  add("allowModels", p.allowModels.includes(r.model), `Model: ${r.model}`);
  add("allowMiners", p.allowMiners.includes(r.miner), `Miner: ${r.miner}`);
  add("denyMiners", !p.denyMiners.includes(r.miner), `Miner: ${r.miner}`);
  for (const [rule, caps, name, predicate] of [
    ["modelCap", p.modelCaps, r.model, (e: Reservation) => e.request.model === r.model],
    ["minerCap", p.minerCaps, r.miner, (e: Reservation) => e.request.miner === r.miner],
  ] as const) {
    const cap = Object.hasOwn(caps, name) ? caps[name] : undefined;
    add(
      rule,
      cap === undefined || sum(predicate) + amount <= parseFlop(cap),
      cap === undefined ? "No additional cap" : `Lifetime cap: ${cap} FLOP`,
    );
  }
  add("requireDryRun", !p.requireDryRun || r.dryRun, "Matching pre-flight required");
  const last = ledger.reduce((n, e) => Math.max(n, e.request.at), -Infinity);
  add("cooldown", r.at - last >= p.cooldown, `Minimum spacing: ${p.cooldown} ms`);
  return {
    decision: rules.every((rule) => rule.passed) ? "allow" : "deny",
    rules,
    fired: rules.filter((rule) => !rule.passed).map((rule) => rule.rule),
    budgets,
  };
}
