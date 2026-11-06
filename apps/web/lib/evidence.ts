// SPDX-License-Identifier: Apache-2.0
// Shape committed recordings for the home page. Every value here is read from a recording, never typed in.
import { readRecording } from "@/app/harness/data";
import { counts } from "@/app/harness/model";
import tape from "../../../packages/verifier/fixtures/settlements-0.json";
import channel from "../../../packages/verifier/fixtures/channel-1.json";
import { checkArithmetic, verifyEvidence } from "../../../packages/verifier/src/checks/index";
import { parseEvidence } from "../../../packages/verifier/src/bundle";
import { array, object } from "../../../packages/verifier/src/schema";
import type { Status as VerifierStatus } from "../../../packages/verifier/src/types";
import { repository } from "@/content/tools";
import type { ClaimStatus } from "./status";

export type { ClaimStatus };
export type MatrixClaim = { id: string; title: string; kind: string; status: ClaimStatus; reason: string };
export type ClaimRun = {
  claims: MatrixClaim[];
  counts: Record<ClaimStatus, number>;
  measuredAt: string;
  requests: number;
  spentFlop: string;
  recording: string;
};

/** The recorded conformance run in catalogue order. Null when the recording does not validate. @example readClaimRun()?.counts.FAIL */
export function readClaimRun(): ClaimRun | null {
  const report = readRecording();
  if (!report) return null;
  const total = counts(report.results);
  return {
    claims: report.results.map((result) => ({
      id: result.claim.id,
      title: result.claim.title,
      kind: result.claim.kind,
      status: result.status,
      reason: result.reason,
    })),
    counts: { PASS: total.PASS, FAIL: total.FAIL, UNVERIFIABLE: total.UNVERIFIABLE, SKIPPED: total.SKIPPED },
    measuredAt: report.measuredAt,
    requests: report.budget.requests,
    spentFlop: report.budget.spentFlop,
    recording: `${repository}/blob/main/packages/harness/last-run.json`,
  };
}

export type TapeRow = {
  channel: string | null;
  block: number | null;
  settledAt: number | null;
  minerPaid: string | null;
  unusedEscrow: string | null;
  burned: string | null;
  escrow: string | null;
  difference: string | null;
  conservation: VerifierStatus;
  ratio: VerifierStatus;
};
export type SettlementTape = {
  rows: TapeRow[];
  measuredAt: string;
  source: string;
  tool: string;
  recording: string;
  pass: number;
  fail: number;
  checks: number;
};

function field(inputs: Record<string, unknown> | undefined, key: string): string | null {
  const value = inputs?.[key];
  return typeof value === "string" ? value : null;
}

/** Run the verifier's arithmetic over the first rows of the recorded tape page. @example readSettlementTape().pass */
export function readSettlementTape(limit = 20): SettlementTape {
  const rows = array(object(JSON.parse(tape.raw), "recorded tape").data, "settlements").slice(0, limit);
  const shaped = rows.map((value): TapeRow => {
    const [conservation, ratio] = checkArithmetic(value);
    const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return {
      channel: typeof row.channelId === "string" ? row.channelId : null,
      block: typeof row.settledBlock === "number" ? row.settledBlock : null,
      settledAt: typeof row.settledAt === "number" ? row.settledAt : null,
      minerPaid: field(conservation?.inputs, "minerPaid"),
      unusedEscrow: field(conservation?.inputs, "unusedEscrow"),
      burned: field(conservation?.inputs, "burned"),
      escrow: field(conservation?.inputs, "escrow"),
      difference: field(conservation?.inputs, "difference"),
      conservation: conservation?.status ?? "UNVERIFIABLE",
      ratio: ratio?.status ?? "UNVERIFIABLE",
    };
  });
  const statuses = shaped.flatMap((row) => [row.conservation, row.ratio]);
  return {
    rows: shaped,
    measuredAt: tape.measuredAt,
    source: tape.source,
    tool: tape.tool,
    recording: `${repository}/blob/main/packages/verifier/fixtures/settlements-0.json`,
    pass: statuses.filter((status) => status === "PASS").length,
    fail: statuses.filter((status) => status === "FAIL").length,
    checks: statuses.length,
  };
}

export type EvidenceChip = { tool: "harness" | "verifier"; id: string; title: string; status: string | null };

// The same names the verifier page uses for these checks.
const VERIFIER_TITLES: Record<string, string> = {
  "escrow-conservation": "Escrow conservation",
  "price-consistency": "Agreed compute price",
  "merkle-inclusion": "Transcript inclusion",
  "assurance-tier": "Assurance evidence",
  "challenge-window": "Challenge window",
};
export type PromiseRow = {
  promise: string;
  outside: string;
  chips: EvidenceChip[];
  href: string;
  action: string;
};
export type PromiseLedger = { rows: PromiseRow[]; harnessAt: string | null; verifierAt: string | null };

/** Place each documented promise next to recorded check results. Missing results stay visible as null. @example (await readPromiseLedger(readClaimRun())).rows */
export async function readPromiseLedger(run: ClaimRun | null): Promise<PromiseLedger> {
  const report = await verifyEvidence(parseEvidence(channel));
  const harness = (id: string): EvidenceChip => {
    const claim = run?.claims.find((item) => item.id === id);
    return { tool: "harness", id, title: claim?.title ?? id, status: claim?.status ?? null };
  };
  const verifier = (id: string): EvidenceChip => ({
    tool: "verifier",
    id,
    title: VERIFIER_TITLES[id] ?? id,
    status: report.checks.find((check) => check.id === id)?.status ?? null,
  });
  return {
    harnessAt: run?.measuredAt ?? null,
    verifierAt: report.capturedAt,
    rows: [
      {
        promise: "Agents pay GPU miners for inference.",
        outside:
          "Recorded settlements split their escrow into miner pay, unused escrow and burn. The split adds up in exact integer arithmetic. That does not prove funds moved or that the price was agreed.",
        chips: [harness("settlement-conservation"), verifier("escrow-conservation"), verifier("price-consistency")],
        href: "/verify",
        action: "Check a settlement",
      },
      {
        promise: "Miners submit proofs of the work.",
        outside:
          "The public TEE check labels itself simulated. The public docs give no byte-exact transcript encoding, so inclusion stays unverifiable.",
        chips: [harness("simulated-tee-label"), verifier("merkle-inclusion"), verifier("assurance-tier")],
        href: "/verify",
        action: "Read the proof checks",
      },
      {
        promise: "Anyone can challenge a session for about seven days.",
        outside:
          "The SDK documents cooperative settlement as an immediate payout with no standard window. Public surfaces do not expose the live window constant.",
        chips: [harness("challenge-window"), verifier("challenge-window")],
        href: "/challenger",
        action: "Watch the windows",
      },
      {
        promise: "Proven fraud costs the miner its whole stake.",
        outside:
          "The documented slash and base stake are design parameters. Public surfaces do not expose the runtime constants. The challenger has no slashing-history feed.",
        chips: [harness("fraud-slash"), harness("miner-stake")],
        href: "/harness",
        action: "Inspect the claims",
      },
    ],
  };
}
