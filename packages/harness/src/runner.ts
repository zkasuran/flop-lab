// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_URL } from "@flop-lab/mcp";
import { Context, CACHE_TTL_MS } from "./context";
import { checkClaim } from "./checks";
import { loadClaims } from "./catalogue";
import { GATEWAY, Transport } from "./transport";
import { object } from "./validation";
import type { Attempt, Claim, Observation, Risk, RunReport } from "./types";

export interface RunOptions {
  only?: string;
  risk?: Risk;
  maxRequests?: number;
  maxFlop?: string;
  allowSpend?: boolean;
  claims?: Claim[];
  transport?: Transport;
}

/** Exact FLOP decimal ceiling, rejecting signs and exponent notation. @example parseFlop("0.01") */
export function parseFlop(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(value) || value.length > 60)
    throw new Error("max-flop must be a nonnegative decimal with at most 18 fractional digits");
  const [whole = "0", fractional = ""] = value.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fractional.padEnd(18, "0"));
}

/** Run bounded public conformance checks; failures require a fresh confirmation. @example await runHarness({ only: "gateway-contract", maxRequests: 8 }) */
export async function runHarness(options: RunOptions = {}): Promise<RunReport> {
  const maxFlop = options.maxFlop ?? "0";
  const ceiling = parseFlop(maxFlop);
  const claims = options.claims ?? (await loadClaims());
  if (options.only && !claims.some((claim) => claim.id === options.only))
    throw new Error(`Unknown claim: ${options.only}`);
  const transport = options.transport ?? new Transport({ maxRequests: options.maxRequests });
  const context = new Context(transport);
  const started = Date.now();
  const report: RunReport = {
    version: 1,
    measuredAt: new Date(started).toISOString(),
    finishedAt: "",
    durationMs: 0,
    source: [DEFAULT_URL, GATEWAY],
    network: {
      name: null,
      genesisHash: null,
      specVersion: null,
      reason:
        "Hosted health and indexer do not expose a verifiable genesis hash or runtime spec version. Network identity remains incomplete.",
      evidence: [],
    },
    budget: { maxRequests: transport.maxRequests, requests: 0, maxFlop, spentFlop: "0", cacheTtlMs: CACHE_TTL_MS },
    results: [],
    evidence: transport.evidence,
  };
  if (!transport.exhausted) {
    try {
      const health = object(await context.call("flop_health"));
      if (typeof health.chain === "string") report.network.name = health.chain;
    } catch (error) {
      report.network.reason += ` Health unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
    report.network.evidence = [...context.used];
  }
  for (const claim of claims) {
    const result: RunReport["results"][number] = {
      claim,
      status: "SKIPPED",
      flaky: false,
      reason: "Not selected",
      attempts: [],
      command: `pnpm --filter @flop-lab/harness start run --only ${claim.id} --max-requests 80 --max-flop 0`,
    };
    report.results.push(result);
    if ((options.only && claim.id !== options.only) || (options.risk && claim.risk !== options.risk)) continue;
    if (claim.risk === "spends-test-funds" && (!options.allowSpend || ceiling === 0n)) {
      result.reason = "Requires --allow-spend and a positive --max-flop ceiling. No transactions submitted.";
      continue;
    }
    if (transport.exhausted && claim.check !== "unavailable") {
      result.reason = "Global request budget exhausted";
      continue;
    }
    const attempt = async (): Promise<Attempt> => {
      context.used.clear();
      const at = Date.now();
      let observation: Observation;
      try {
        observation = await checkClaim(claim, context);
      } catch (error) {
        observation = {
          status: "UNVERIFIABLE",
          observed: null,
          reason: `Could not evaluate predicate: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      return {
        ...observation,
        measuredAt: new Date(at).toISOString(),
        durationMs: Date.now() - at,
        evidence: [...context.used],
      };
    };
    const first = await attempt();
    result.attempts.push(first);
    result.status = first.status;
    result.reason = first.reason;
    if (first.status === "FAIL") {
      context.fresh();
      const second = await attempt();
      result.attempts.push(second);
      if (second.status !== "FAIL" || second.reason !== first.reason) {
        result.status = "UNVERIFIABLE";
        result.flaky = true;
        result.reason = `Failure was not reproduced: ${second.reason}`;
      } else result.reason = `Confirmed by a fresh repeat: ${first.reason}`;
    }
    if (result.status === "UNVERIFIABLE" && claim.evidenceNeeded)
      result.reason += ` Public data needed: ${claim.evidenceNeeded}`;
  }
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - started;
  report.budget.requests = transport.requests;
  return report;
}
