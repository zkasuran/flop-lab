// SPDX-License-Identifier: Apache-2.0
import { Transport } from "../../harness/src/transport";
import { Context } from "../../harness/src/context";
import { checkClaim } from "../../harness/src/checks";
import type { Claim } from "@flop-lab/harness";
import { auditSnapshot } from "@flop-lab/indexer-audit";
import { compare, recordedSpec, runtimeFromRecordings, object, parseRecording } from "@flop-lab/spec";
import { verifyEvidence, parseEvidence } from "@flop-lab/verifier";
import registryResults from "../../harness/fixtures/coverage/results-0.json";
import auditResults from "../../harness/fixtures/coverage/results-9.json";
import type { Check, Suite } from "./types";

export interface Inputs {
  verifier?: unknown;
  indexer?: unknown;
  harness?: unknown;
  spec?: unknown;
}
export const SUITES: readonly Suite[] = ["verifier", "indexer", "harness", "spec"];

function unavailable(suite: Suite, reason: string): Check[] {
  return [{ id: `${suite}:input`, suite, status: "UNVERIFIABLE", reason, evidence: [] }];
}

function identity(body: string) {
  const request = object(JSON.parse(body));
  return JSON.stringify([request.method, request.params]);
}

async function harness(input: unknown): Promise<Check[]> {
  if (!Array.isArray(input) || input.length > 20) throw new Error("Expected bounded harness HTTP captures");
  const captures = input.map((value) => {
    const item = object(value);
    const request = object(item.request);
    const source = parseRecording({ source: request.url, measuredAt: item.measuredAt, raw: item.response });
    if (source.source !== "https://mcp.flop.network/mcp" || typeof request.body !== "string" || item.status !== 200)
      throw new Error("Invalid harness capture");
    return { ...source, body: request.body };
  });
  // Execute the existing predicates with their original claims. Imported files cannot select other checks.
  const selected = [
    registryResults.find((r) => r.claim.id === "model-registry")!,
    auditResults.find((r) => r.claim.id === "audit-rate")!,
  ];
  const claims = selected.map((r) => r.claim) as Claim[];
  const transport = new Transport({
    intervalMs: 0,
    sleep: async () => {},
    maxRequests: 12,
    fetch: async (_url, init) => {
      const body = String(init?.body);
      const capture = captures.find((c) => identity(c.body) === identity(body));
      if (!capture) throw new Error("No recorded response for this exact request");
      const id = object(JSON.parse(body)).id;
      // Only the JSON-RPC correlation id changes. Tool response bytes remain untouched.
      return new Response(capture.raw.replace(/"id"\s*:\s*\d+/, `"id":${Number(id)}`), {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });
  // Import the existing predicate API directly. The full CLI runner also imports
  // filesystem catalogue loaders, which server bundlers cannot resolve as modules.
  const context = new Context(transport);
  const results: Check[] = [];
  for (const claim of claims) {
    context.used.clear();
    try {
      const result = await checkClaim(claim, context);
      const used = transport.evidence.filter((e) => context.used.has(e.id));
      results.push({
        id: `harness:${claim.id}`,
        suite: "harness",
        status: result.status,
        reason: `${result.reason} This is replayed recorded input, not a fresh confirmation.`,
        evidence: captures
          .filter((c) => used.some((e) => e.request.body && identity(e.request.body) === identity(c.body)))
          .map((c) => ({ source: c.source, measuredAt: c.measuredAt, detail: c.body })),
      });
    } catch (error) {
      results.push({
        id: `harness:${claim.id}`,
        suite: "harness",
        status: "UNVERIFIABLE",
        reason: error instanceof Error ? error.message : String(error),
        evidence: [],
      });
    }
  }
  return results;
}

/** Execute one existing suite library against native raw inputs. This function makes no network calls.
 * @example await runSuite("verifier", recordedInputs().verifier)
 */
export async function runSuite(suite: Suite, input: unknown): Promise<Check[]> {
  try {
    if (suite === "verifier") {
      const bundle = parseEvidence(input);
      const result = await verifyEvidence(bundle);
      if (result.checks.some((c) => c.id === "bundle-integrity" && c.status === "FAIL"))
        return unavailable(suite, "Bundle integrity failed. The input cannot support an observation.");
      return result.checks.map((c) => ({
        id: `verifier:${c.id}`,
        suite,
        status: c.status === "NOT_APPLICABLE" ? "UNVERIFIABLE" : c.status,
        reason: c.detail,
        evidence: bundle.observations
          .filter((o) => c.evidence.includes(o.id))
          .map((o) => ({
            source: o.source,
            measuredAt: o.measuredAt,
            detail: `${o.tool}: ${JSON.stringify(c.inputs)}`,
          })),
      }));
    }
    if (suite === "indexer") {
      const report = auditSnapshot(input);
      return report.findings.map((f) => ({
        id: `indexer:${f.id}`,
        suite,
        status: f.status,
        reason: f.reason,
        evidence: report.snapshot.observations
          .filter((o) => [...f.left.observationIds, ...f.right.observationIds].includes(o.id))
          .map((o) => ({
            source: o.source,
            measuredAt: o.measuredAt,
            detail: `${f.formula}\n${f.left.label}: ${f.left.value}\n${f.right.label}: ${f.right.value}`,
          })),
      }));
    }
    if (suite === "harness") return await harness(input);
    const runtime = runtimeFromRecordings(object(input));
    const report = compare(recordedSpec(), runtime, {
      mode: "recorded",
      at: runtime.measuredAt ?? new Date(0).toISOString(),
    });
    return report.differences
      .filter((d) => d.appendix === "A")
      .map((d) => ({
        id: `spec:${d.name}`,
        suite,
        status: d.result === "MATCH" ? "PASS" : d.result === "DRIFT" ? "FAIL" : "UNVERIFIABLE",
        reason: `${d.reason} Catalog comparison only; runtime enforcement is not verified.`,
        evidence: [d.spec, d.runtime].flatMap((item) =>
          item
            ? [{ source: item.evidence.source, measuredAt: item.evidence.measuredAt, detail: item.evidence.quote }]
            : [],
        ),
      }));
  } catch (error) {
    return unavailable(suite, error instanceof Error ? error.message : String(error));
  }
}
