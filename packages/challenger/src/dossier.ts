// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_URL, McpClient, escrowConserved, getComputeChannel, getTrustRoot } from "@flop-lab/mcp";
import { CHALLENGE_DOC } from "./core";
import { channel, object, text } from "./validation";
import type { Check, Dossier, Observation, WatchReport } from "./types";

/** Assemble public observations for human review. Never constructs or submits a transaction. @example await draftDossier(report, channelId, client) */
export async function draftDossier(
  report: WatchReport,
  channelId: string,
  client: McpClient,
  source = DEFAULT_URL,
): Promise<Dossier> {
  const row = report.rows.find((r) => r.settlement.channelId === channelId);
  if (!row) throw new Error("Channel is not in the retrieved tape. Use an exact channel ID from watch.");
  const checks: Check[] = [
    {
      name: "Escrow conservation",
      status: escrowConserved(row.settlement) ? "pass" : "fail",
      detail: "Exact integer check: minerPaid + unusedEscrow + burned = escrow. Passing checks arithmetic only.",
    },
  ];
  let observedChannel: Observation<Record<string, unknown>> | null = null;
  let trustRoot: Observation<Record<string, unknown>> | null = null;
  try {
    const response = await getComputeChannel(client, channelId);
    const value = channel(response.value);
    observedChannel = { value, measuredAt: response.measuredAt, source: `${source}#flop_get_compute_channel` };
    const fields = ["channelId", "agent", "miner", "escrow", "minerPaid", "burned", "aggregateGn"] as const;
    const missing = fields.filter((key) => value[key] === undefined);
    const mismatched = fields.filter((key) => value[key] !== undefined && value[key] !== row.settlement[key]);
    const provenance =
      value.settlement === undefined || value.settlement === null ? null : object(value.settlement, "settlement");
    if (
      provenance &&
      (provenance.blockNumber !== row.settlement.settledBlock ||
        (row.settlement.settledBlockHash !== null && provenance.blockHash !== row.settlement.settledBlockHash))
    )
      mismatched.push("channelId");
    checks.push({
      name: "Channel and tape agreement",
      status: mismatched.length ? "fail" : missing.length || !provenance ? "unverifiable" : "pass",
      detail: mismatched.length
        ? "Channel fields or settlement block provenance differ from the tape. Inspect source drift or inconsistency before drawing conclusions."
        : missing.length || !provenance
          ? "Required channel fields or settlement block provenance are missing."
          : "Channel parties, amounts and settlement block provenance agree with the tape.",
    });
    checks.push({
      name: "Finality",
      status: "unverifiable",
      detail: `Indexer observationHead: ${String(value.observationHead ?? "absent")}. This is a server claim, not independently verified finality.`,
    });
  } catch (error) {
    checks.push({
      name: "Channel evidence",
      status: "unverifiable",
      detail: error instanceof Error ? error.message : "Channel request failed",
    });
  }
  try {
    const response = await getTrustRoot(client);
    const value = object(response.value, "trust root");
    text(value.snapshotHash, "trust root.snapshotHash");
    trustRoot = { value, measuredAt: response.measuredAt, source: `${source}#flop_trust_root` };
  } catch (error) {
    checks.push({
      name: "Trust-root observation",
      status: "unverifiable",
      detail: error instanceof Error ? error.message : "Trust-root request failed",
    });
  }
  checks.push(
    {
      name: "DA audit data",
      status: "unverifiable",
      detail:
        "The inspected public channel and tool schemas provide no turn transcript, DA locator, retrieval proof or decryption material.",
    },
    {
      name: "TOPLOC and prefill",
      status: "unverifiable",
      detail:
        "No per-turn activation fingerprints, reproducible model inputs or comparison parameters are available in this evidence bundle. No inference was re-run.",
    },
    {
      name: "Bisection and signed turn evidence",
      status: "unverifiable",
      detail:
        "No documented public bisection messages, signed transcript leaf, Merkle path or dispute evidence encoding was found in the inspected references.",
    },
    {
      name: "Runtime deadline and eligibility",
      status: "unverifiable",
      detail:
        "The docs describe paying agents and active validators. This tool does not establish caller eligibility, a live dispute bond or a runtime filing deadline.",
    },
  );
  return {
    mode: "DRY RUN ONLY",
    channelId,
    createdAt: report.evaluatedAt,
    purpose: "Worth a human look. This dossier is not a fraud verdict or submission-ready evidence.",
    window: row.window,
    assumptions: report.assumptions,
    priority: row.priority,
    bond: {
      documentedFlop: "100",
      source: CHALLENGE_DOC,
      runtimeVerified: false,
      warning: "The documented discretionary bond is forfeited if frivolous. No bond is posted by this tool.",
    },
    eligibility:
      "Documented lanes: the paying agent for its own session or any active validator. Outsider eligibility is not established.",
    submission: {
      available: false,
      extrinsic: null,
      missing: [
        "Documented discretionary-dispute pallet, method and argument types",
        "Canonical evidence encoding and runtime version qualification",
        "Runtime challenge start event, duration and eligibility state",
      ],
    },
    checks,
    evidence: {
      settlement: {
        value: row.settlement.raw,
        source: `${report.tape.source}#flop_list_settlements`,
        measuredAt: row.measuredAt,
      },
      channel: observedChannel,
      trustRoot,
    },
  };
}
