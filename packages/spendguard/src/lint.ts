// SPDX-License-Identifier: Apache-2.0
import caps from "../fixtures/documented-caps.json";
import { parseFlop, parsePolicy, parsePolicyDocument, type Policy } from "./policy";

export interface LintFinding {
  code: "invalid" | "missing-ceiling" | "contradiction" | "unreachable" | "above-reference";
  severity: "error" | "warning";
  path: string;
  message: string;
  fix: string;
}
export interface LintReport {
  valid: boolean;
  findings: LintFinding[];
  reference: typeof caps;
}

/** Inspect static policy rules against a dated SDK reference, not runtime state. @example lintPolicy(policy).findings */
export function lintPolicy(input: unknown): LintReport {
  const findings: LintFinding[] = [];
  const add = (
    code: LintFinding["code"],
    path: string,
    message: string,
    fix: string,
    severity: LintFinding["severity"] = "warning",
  ) => findings.push({ code, severity, path, message, fix });
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const raw = object(input);
  for (const path of [
    "budgets.task",
    "budgets.hour",
    "budgets.day",
    "budgets.total",
    "maxEscrowPerSession",
    "maxPricePerGflop",
  ]) {
    const [parent, child] = path.split(".");
    const value = child ? object(raw[parent!])[child] : raw[parent!];
    if (value === undefined || value === null)
      add(
        "missing-ceiling",
        path,
        "A required ceiling is missing.",
        `Set ${path} to an explicit quoted decimal FLOP ceiling.`,
        "error",
      );
  }
  let p: Policy;
  try {
    p = parsePolicy(input);
  } catch (error) {
    add(
      "invalid",
      "policy",
      error instanceof Error ? error.message : "Invalid policy",
      "Use the policy schema. Quote amounts and remove unknown or duplicate keys.",
      "error",
    );
    return { valid: false, findings, reference: caps };
  }
  for (const key of ["allowModels", "allowMiners"] as const) {
    if (!p[key].length)
      add(
        "contradiction",
        key,
        "This empty allowlist denies every request.",
        `Add an intended identity to ${key} or retain this as an intentional stop policy.`,
      );
  }
  for (const miner of p.allowMiners.filter((miner) => p.denyMiners.includes(miner)))
    add(
      "contradiction",
      "allowMiners",
      `${miner} is both allowed and denied. Deny wins.`,
      `Remove ${miner} from allowMiners to keep the deny explicit.`,
    );
  for (const [key, value] of Object.entries(p.budgets)) {
    if (parseFlop(value) === 0n)
      add(
        "contradiction",
        `budgets.${key}`,
        "A zero budget denies every positive request in its scope.",
        "Set a positive ceiling if this is not an intentional stop policy.",
      );
  }
  if (parseFlop(p.maxEscrowPerSession) === 0n)
    add(
      "contradiction",
      "maxEscrowPerSession",
      "No positive escrow can pass.",
      "Set a positive escrow ceiling if spending is intended.",
    );
  for (const [smaller, larger] of [
    ["hour", "day"],
    ["day", "total"],
    ["task", "total"],
  ] as const) {
    if (parseFlop(p.budgets[smaller]) > parseFlop(p.budgets[larger]))
      add(
        "unreachable",
        `budgets.${smaller}`,
        `The ${larger} ceiling binds before this ceiling can be reached.`,
        `Lower budgets.${smaller} to at most ${p.budgets[larger]}.`,
      );
  }
  const minimum = Object.values(p.budgets).reduce((a, b) => (parseFlop(a) < parseFlop(b) ? a : b));
  if (parseFlop(p.maxEscrowPerSession) > parseFlop(minimum))
    add(
      "unreachable",
      "maxEscrowPerSession",
      "A budget ceiling prevents reaching this escrow ceiling.",
      `Lower maxEscrowPerSession to at most ${minimum}.`,
    );
  for (const [key, allowed] of [
    ["modelCaps", p.allowModels],
    ["minerCaps", p.allowMiners.filter((m) => !p.denyMiners.includes(m))],
  ] as const) {
    for (const [name, value] of Object.entries(p[key])) {
      if (!allowed.includes(name))
        add(
          "unreachable",
          `${key}.${name}`,
          "The allow and deny rules prevent this cap from being used.",
          `Remove the unused ${key} entry for ${name}.`,
        );
      else if (parseFlop(value) > parseFlop(p.budgets.total))
        add(
          "unreachable",
          `${key}.${name}`,
          "The shared total binds before this lifetime cap.",
          `Lower this cap to at most ${p.budgets.total}.`,
        );
      else if (parseFlop(value) === 0n)
        add(
          "contradiction",
          `${key}.${name}`,
          "This allowed identity has a zero lifetime cap.",
          "Remove the identity from the allowlist or set a positive cap.",
        );
    }
  }
  for (const [path, value, cap] of [
    ["maxEscrowPerSession", p.maxEscrowPerSession, caps.perTxFlop],
    ["budgets.day", p.budgets.day, caps.dailyFlop],
  ]) {
    if (parseFlop(value) > parseFlop(cap))
      add(
        "above-reference",
        path!,
        `Exceeds the SDK calibrated reference of ${cap} FLOP. This is not a runtime observation.`,
        `Lower ${path} to ${cap} or document the independently verified authority for this policy.`,
      );
  }
  return { valid: true, findings, reference: caps };
}

/** Decode strict YAML or JSON and return actionable lint diagnostics. @example lintPolicyText(text) */
export function lintPolicyText(text: string): LintReport {
  try {
    return lintPolicy(parsePolicyDocument(text));
  } catch (error) {
    return {
      valid: false,
      reference: caps,
      findings: [
        {
          code: "invalid",
          severity: "error",
          path: "policy",
          message: error instanceof Error ? error.message : "Invalid text",
          fix: "Use JSON or the documented strict YAML subset.",
        },
      ],
    };
  }
}
