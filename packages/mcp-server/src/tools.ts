// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { McpClient } from "@flop-lab/mcp";
import { EvidenceFetcher, verifyEvidence, checkArithmetic } from "@flop-lab/verifier";
import { Collector, rankSnapshot, pickMiner } from "@flop-lab/scoreboard";
import { evaluate, parsePolicy, parseRequest } from "@flop-lab/spendguard";
import { runHarness, loadClaims, Transport } from "@flop-lab/harness";
import { collectTape, analyze as analyzeTape } from "@flop-lab/challenger";
import { compare, recordedSpec, recordedReport, createRuntimeReader } from "@flop-lab/spec";
import { runAudit } from "@flop-lab/mcpaudit";
import { Explorer, classify, recordedExploration } from "@flop-lab/explorer";
import { createAuditor, auditSnapshot } from "@flop-lab/indexer-audit";
import { collectTrail, verifyArtifact } from "@flop-lab/did";
import { diagnose } from "@flop-lab/doctor";
import { boundedFetch } from "./network";
import {
  check,
  count,
  decimal,
  envelope,
  hash,
  mode,
  policy,
  request,
  reservation,
  decision,
  text,
  type ResultData,
} from "./schema";
import {
  claimDirectory,
  localDiskPath,
  recordedChannel,
  recordedContract,
  recordedDidReader,
  recordedDoctor,
  recordedIndexer,
  recordedScore,
  recordedSettlements,
} from "./recorded";

export interface ToolDefinition {
  name: string;
  description: string;
  input: z.ZodType;
  output: z.ZodType;
  run: (input: unknown) => Promise<ResultData>;
}

function define<I extends z.ZodType, O extends z.ZodType>(
  name: string,
  description: string,
  input: I,
  data: O,
  handler: (args: z.output<I>) => Promise<Omit<ResultData, "data"> & { data: z.input<O> }>,
): ToolDefinition {
  return { name, description, input, output: envelope(data), run: (value) => handler(input.parse(value)) };
}
const modes = z.strictObject({ mode });
const bounded = z.strictObject({ mode, limit: z.number().int().min(1).max(25).default(25) });
const shortCheck = (c: { id: string; status: z.infer<typeof check>["status"]; detail: string }) => ({
  id: c.id,
  status: c.status,
  detail: c.detail,
});
const remote = "https://mcp.flop.network/mcp";
const limitations = ["Public observations do not prove inference, chain finality or service authenticity."];
const meta = (selected: "live" | "recorded" | "local", evidence: ResultData["evidence"], notes = limitations) => ({
  mode: selected,
  evidence,
  limitations: notes,
});
const origin = (items: { source: string; measuredAt: string }[]) =>
  items.map(({ source, measuredAt }) => ({ source, measuredAt }));

/** Build the fixed read-only operation registry. @example createTools().map(tool => tool.name) */
export function createTools(options: { recorded?: boolean } = {}): ToolDefinition[] {
  const client = new McpClient({ fetch: boundedFetch, retries: 1, minIntervalMs: 500, timeoutMs: 8000 });
  const verifier = new EvidenceFetcher({ client });
  const collector = new Collector({ fetch: boundedFetch, reliability: true, archive: false });
  const explorer = new Explorer(client);
  const auditor = createAuditor({ fetch: boundedFetch });
  const runtimeReader = createRuntimeReader(client);
  return [
    define(
      "lab_verify_channel",
      "Cross-check a compute channel. Recorded mode accepts the bundled channel only.",
      z.strictObject({ mode, channelId: hash }),
      z.strictObject({ channelId: hash, checks: z.array(check) }),
      async (args) => {
        const bundle =
          args.mode === "recorded" ? recordedChannel() : await verifier.channel(args.channelId, { maxRows: 25 });
        if (bundle.channelId !== args.channelId) throw new Error("Channel is outside the bundled recording");
        const report = await verifyEvidence(bundle);
        return {
          ...meta(args.mode, origin(bundle.observations)),
          data: { channelId: report.channelId, checks: report.checks.map(shortCheck) },
        };
      },
    ),
    define(
      "lab_verify_tape",
      "Check exact escrow arithmetic in a bounded settlement page.",
      bounded,
      z.strictObject({
        complete: z.boolean(),
        rows: z.array(z.strictObject({ channelId: hash, checks: z.array(check) })),
        errors: z.array(text),
      }),
      async (args) => {
        if (args.mode === "recorded") {
          const tape = recordedSettlements();
          return {
            ...meta(args.mode, tape.evidence),
            data: {
              complete: tape.complete && args.limit >= tape.rows.length,
              errors: [],
              rows: tape.rows
                .slice(0, args.limit)
                .map((row) => ({ channelId: hash.parse(row.channelId), checks: checkArithmetic(row).map(shortCheck) })),
            },
          };
        }
        const tape = await verifier.tape(args.limit);
        return {
          ...meta(args.mode, origin(tape.observations)),
          data: {
            complete: tape.complete,
            errors: tape.errors,
            rows: tape.rows.map((row) => ({ channelId: row.channelId, checks: row.checks.map(shortCheck) })),
          },
        };
      },
    ),
    define(
      "lab_score_rank",
      "Rank observed miner evidence. Recorded mode evaluates at capture time.",
      modes,
      z.strictObject({
        miners: z.array(
          z.strictObject({
            miner: text,
            score: z.number().nullable(),
            confidence: z.number().min(0).max(1),
            settlements: count,
            warnings: z.array(text),
          }),
        ),
      }),
      async (args) => {
        const snapshot = args.mode === "recorded" ? recordedScore() : await collector.snapshot();
        const ranks = rankSnapshot(snapshot, {
          now: args.mode === "recorded" ? Date.parse(snapshot.measuredAt) : Date.now(),
        });
        return {
          ...meta(args.mode, origin(snapshot.records), [
            "Scores describe the captured settlement sample. Recorded ranks use capture time.",
          ]),
          data: {
            miners: ranks.map(({ miner, score, confidence, settlements, warnings }) => ({
              miner,
              score,
              confidence,
              settlements,
              warnings,
            })),
          },
        };
      },
    ),
    define(
      "lab_score_route",
      "Select an eligible miner without sending inference. A live price ceiling fails closed if the quote is unknown.",
      z.strictObject({
        mode,
        model: text,
        maxPricePerGflop: decimal.optional(),
        minConfidence: z.number().min(0).max(1).default(0.2),
        exclude: z.array(text).max(100).default([]),
      }),
      z.strictObject({
        status: z.enum(["picked", "no-eligible-miner"]),
        miner: text.nullable(),
        reasons: z.array(text),
        candidates: z.array(z.strictObject({ miner: text, reasons: z.array(text) })),
      }),
      async (args) => {
        const snapshot = args.mode === "recorded" ? recordedScore() : await collector.snapshot();
        // Route eligibility always uses current time. A historical quote is never a live admission.
        const result = pickMiner(snapshot, args);
        return {
          ...meta(args.mode, origin(snapshot.records), [
            "Selection submits no request. Expired recorded quotes remain ineligible at execution time.",
          ]),
          data: {
            status: result.status,
            miner: result.status === "picked" ? result.miner : null,
            reasons: result.status === "picked" ? result.explanation.reasons : result.reasons,
            candidates: result.candidates,
          },
        };
      },
    ),
    define(
      "lab_spendguard_evaluate",
      "Evaluate supplied policy, reservation history and request locally. No ledger writes or spending.",
      z.strictObject({ policy, request, reservations: z.array(reservation).max(1000) }),
      decision,
      async (args) => ({
        ...meta(
          "local",
          [{ source: "caller-supplied policy, reservations and request", measuredAt: new Date().toISOString() }],
          ["This evaluates the supplied history only. It neither reserves funds nor proves the history is complete."],
        ),
        data: evaluate(parsePolicy(args.policy), args.reservations, parseRequest(args.request)),
      }),
    ),
    define(
      "lab_harness_run",
      "Run the bounded read-only gateway contract claim. Hard spending ceiling is zero.",
      z.strictObject({ mode, maxRequests: z.number().int().min(1).max(12).default(4) }),
      z.strictObject({
        requests: count,
        maxRequests: count,
        spentFlop: z.literal("0"),
        results: z.array(
          z.strictObject({ id: text, status: z.enum(["PASS", "FAIL", "UNVERIFIABLE", "SKIPPED"]), reason: text }),
        ),
      }),
      async (args) => {
        const snapshot = args.mode === "recorded" ? recordedScore() : null;
        const models = snapshot?.records.find((row) => row.kind === "models");
        const transport = new Transport({
          fetch: boundedFetch,
          maxRequests: args.maxRequests,
          ...(models
            ? {
                intervalMs: 0,
                fetch: async (url) => {
                  if (String(url) !== "https://api.flop.network/v1/models")
                    throw new Error("Health is outside this recording");
                  return new Response(JSON.stringify(models.raw), { headers: { "content-type": "application/json" } });
                },
              }
            : {}),
        });
        const report = await runHarness({
          only: "gateway-contract",
          profile: "ci",
          risk: "read-only",
          maxFlop: "0",
          allowSpend: false,
          claims: await loadClaims(claimDirectory()),
          transport,
        });
        return {
          ...meta(
            args.mode,
            models
              ? origin([models])
              : report.evidence.map((e) => ({ source: e.request.url, measuredAt: e.measuredAt })),
          ),
          data: {
            requests: args.mode === "recorded" ? 0 : report.budget.requests,
            maxRequests: args.maxRequests,
            spentFlop: "0" as const,
            results: report.results
              .filter((r) => r.claim.id === "gateway-contract")
              .map((r) => ({ id: r.claim.id, status: r.status, reason: r.reason })),
          },
        };
      },
    ),
    define(
      "lab_challenger_watch",
      "Take one bounded challenge-review snapshot. Does not start a daemon or submit challenges.",
      bounded,
      z.strictObject({
        complete: z.boolean(),
        rows: z.array(
          z.strictObject({
            channelId: hash,
            window: z.enum(["estimated-open", "estimated-expired", "unknown", "no-standard-window"]),
            estimatedExpiry: text.nullable(),
            priority: z.number().min(0).max(100),
            reason: text,
          }),
        ),
      }),
      async (args) => {
        const recording = recordedSettlements();
        const replay: typeof fetch = async (_url, init) => {
          const rpc = z
            .object({ id: z.number(), params: z.object({ name: z.string() }) })
            .parse(JSON.parse(String(init?.body)));
          if (rpc.params.name !== "flop_list_settlements") throw new Error("Block cadence is outside this recording");
          return Response.json({
            jsonrpc: "2.0",
            id: rpc.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    data: recording.rows.slice(0, args.limit),
                    pagination: { total: recording.rows.length, offset: 0, limit: args.limit, hasMore: true },
                  }),
                },
              ],
            },
          });
        };
        const recordedAt = Date.parse(recording.evidence[0]!.measuredAt);
        const tape = await collectTape(
          args.mode === "recorded"
            ? new McpClient({ fetch: replay, retries: 0, minIntervalMs: 0, now: () => recordedAt })
            : client,
          { maxRows: args.limit, mode: args.mode, ...(args.mode === "recorded" ? { now: () => recordedAt } : {}) },
        );
        const report = analyzeTape(tape, Date.now());
        return {
          ...meta(
            args.mode,
            [{ source: tape.source, measuredAt: tape.measuredAt }],
            [...report.assumptions, ...tape.warnings, ...tape.coverage.notes],
          ),
          data: {
            complete: tape.coverage.complete,
            rows: report.rows.map((r) => ({
              channelId: r.settlement.channelId,
              window: r.window.status,
              estimatedExpiry: r.window.estimatedExpiry,
              priority: r.priority.score,
              reason: r.window.reason,
            })),
          },
        };
      },
    ),
    define(
      "lab_spec_diff",
      "Compare the pinned paper with observed protocol catalog and transactions.",
      modes,
      z.strictObject({
        sha: text,
        differences: z.array(
          z.strictObject({
            id: text,
            result: z.enum(["MATCH", "DRIFT", "SPEC_ONLY", "RUNTIME_ONLY", "UNOBSERVABLE"]),
            reason: text,
          }),
        ),
      }),
      async (args) => {
        const report =
          args.mode === "recorded"
            ? recordedReport()
            : compare(recordedSpec(), (await runtimeReader()).runtime, { mode: "live", at: new Date().toISOString() });
        return {
          ...meta(
            args.mode,
            [
              {
                source: `https://github.com/flop-labs/yellowpaper/tree/${report.sha}`,
                measuredAt: report.specMeasuredAt,
              },
              { source: remote, measuredAt: report.runtimeMeasuredAt ?? report.lastCompared },
            ],
            [...limitations, ...report.warnings],
          ),
          data: {
            sha: report.sha,
            differences: report.differences.map(({ id, result, reason }) => ({ id, result, reason })),
          },
        };
      },
    ),
    define(
      "lab_mcp_audit",
      "Audit the hosted knowledge tool against its own advertised schemas with a bounded request budget.",
      z.strictObject({ mode, maxRequests: z.number().int().min(3).max(12).default(8) }),
      z.strictObject({
        results: z.array(
          z.strictObject({
            name: text,
            status: z.enum(["PASS", "VIOLATION", "UNVERIFIABLE", "SKIPPED"]),
            reason: text,
          }),
        ),
      }),
      async (args) => {
        if (args.mode === "recorded") {
          const r = recordedContract();
          return {
            ...meta(args.mode, r.evidence),
            data: {
              results: [{ name: r.observation.tool, status: r.observation.status, reason: r.observation.reason }],
            },
          };
        }
        const report = await runAudit({
          fetch: boundedFetch,
          tool: "flop_knowledge_get",
          maxRequests: args.maxRequests,
        });
        return {
          ...meta(args.mode, [{ source: report.source, measuredAt: report.measuredAt }]),
          data: { results: report.tools.map(({ name, status, reason }) => ({ name, status, reason })) },
        };
      },
    ),
    define(
      "lab_explorer_lookup",
      "Look up a block, hash or address with exact identifier matching. Recorded mode only returns its captured input.",
      z.strictObject({ mode, query: z.string().min(1).max(128) }),
      z.strictObject({
        status: z.enum(["found", "partial", "unavailable", "not_found"]),
        entities: z.array(
          z.strictObject({
            kind: text,
            id: text,
            notes: z.array(text),
            derived: z.array(z.strictObject({ label: text, value: text, formula: text })),
          }),
        ),
      }),
      async (args) => {
        const parsed = classify(args.query);
        const report =
          args.mode === "recorded" ? recordedExploration(parsed.kinds[0]!) : await explorer.search(args.query);
        if (args.mode === "recorded" && !report.entities.some((e) => e.id === parsed.input))
          throw new Error("Query is outside the bundled exploration");
        return {
          ...meta(args.mode, origin([...report.lookups, ...report.entities.flatMap((e) => e.evidence)])),
          data: {
            status: report.status,
            entities: report.entities.map((e) => ({
              kind: e.kind,
              id: e.id,
              notes: e.notes,
              derived: e.derived.map(({ label, value, formula }) => ({ label, value, formula })),
            })),
          },
        };
      },
    ),
    define(
      "lab_indexer_audit",
      "Audit bounded block links, counters and settlement splits. Recorded mode uses the capture's fixed sample.",
      z.strictObject({ mode, limit: z.number().int().min(1).max(10).default(3) }),
      z.strictObject({
        findings: z.array(
          z.strictObject({ id: text, status: z.enum(["PASS", "FAIL", "UNVERIFIABLE"]), reason: text, formula: text }),
        ),
      }),
      async (args) => {
        const capture = args.mode === "recorded" ? recordedIndexer() : null;
        if (capture && capture.limit !== args.limit) throw new Error("Recorded indexer sample uses limit 3");
        const report = capture ? auditSnapshot(capture) : await auditor.run({ limit: args.limit });
        return {
          ...meta(args.mode, origin(report.snapshot.observations)),
          data: {
            findings: report.findings.map(({ id, status, reason, formula }) => ({ id, status, reason, formula })),
          },
        };
      },
    ),
    define(
      "lab_did_trail",
      "Verify the bundled public DID trail and signed artifacts. This operation is recorded-only.",
      z.strictObject({ query: z.string().regex(/^(did:key:z[1-9A-HJ-NP-Za-km-z]{47}|[0-9a-f]{16})$/) }),
      z.strictObject({
        fingerprint: text,
        did: text.nullable(),
        artifacts: z.array(
          z.strictObject({ id: text, status: z.enum(["verified", "invalid", "unverifiable"]), reason: text }),
        ),
        gaps: z.array(text),
      }),
      async (args) => {
        const trail = await collectTrail(args.query, recordedDidReader);
        if (!trail.observations.length) throw new Error("DID is outside the bundled trail");
        const artifacts = await Promise.all(
          trail.artifacts.map(async (a) => ({ id: a.id, ...(await verifyArtifact(a)) })),
        );
        return {
          ...meta("recorded", origin(trail.observations), [
            "A signature authenticates retained bytes, not the truth of a claim. The trail covers only the bundled public capture.",
          ]),
          data: { fingerprint: trail.fingerprint, did: trail.did, artifacts, gaps: trail.gaps },
        };
      },
    ),
    define(
      "lab_doctor",
      "Read local operator readiness. Offline only, no port binding and no caller-selected paths.",
      z.strictObject({ role: z.enum(["miner", "validator"]).default("miner") }),
      z.strictObject({
        role: z.enum(["miner", "validator"]),
        status: z.enum(["READY", "NOT_READY", "UNKNOWN"]),
        requirements: z.array(
          z.strictObject({ id: text, status: z.enum(["READY", "NOT_READY", "UNKNOWN"]), detail: text }),
        ),
      }),
      async (args) => {
        const report = options.recorded
          ? recordedDoctor()
          : await diagnose({ role: args.role, offline: true, skipPorts: true, diskPath: localDiskPath() });
        if (report.role !== args.role) throw new Error("Recorded doctor capture uses the miner role");
        return {
          ...meta(
            options.recorded ? "recorded" : "local",
            [{ source: "local read-only operator probes", measuredAt: report.measuredAt }],
            ["Offline probes do not test clock skew, port availability, model service access or operator admission."],
          ),
          data: {
            role: report.role,
            status: report.status,
            requirements: report.requirements.map(({ id, status, detail }) => ({ id, status, detail })),
          },
        };
      },
    ),
  ];
}
