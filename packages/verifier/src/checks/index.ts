// SPDX-License-Identifier: Apache-2.0
import { integrityErrors, parseEvidence } from "../bundle";
import { array, boolean, hash, height, integer, Missing, object, text } from "../schema";
import type { Check, Evidence, Report } from "../types";
import { checkPublicEvidence } from "./public";

type Outcome = Pick<Check, "status" | "detail">;
const pass = (detail: string): Outcome => ({ status: "PASS", detail });
const unknown = (detail: string): Outcome => ({ status: "UNVERIFIABLE", detail });
const na = (detail: string): Outcome => ({ status: "NOT_APPLICABLE", detail });

function assert(condition: boolean, detail: string): asserts condition {
  if (!condition) throw new Error(detail);
}

function check(
  id: string,
  claim: string,
  evidence: string[],
  run: (inputs: Record<string, unknown>) => Outcome,
): Check {
  const inputs: Record<string, unknown> = {};
  try {
    return { id, claim, evidence, inputs, ...run(inputs) };
  } catch (error) {
    return {
      id,
      claim,
      evidence,
      inputs,
      status: error instanceof Missing ? "UNVERIFIABLE" : "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Exit status shared by the CLI and browser. An empty run is unverifiable.
 * @example resultCode([{status: "FAIL"}]); // 1
 */
export function resultCode(checks: ReadonlyArray<{ status: Check["status"] }>): 0 | 1 | 3 {
  if (checks.some((c) => c.status === "FAIL")) return 1;
  if (checks.length === 0 || checks.some((c) => c.status === "UNVERIFIABLE")) return 3;
  return 0;
}

/** Exact arithmetic over one untrusted settlement row.
 * @example const checks = checkArithmetic(JSON.parse(rawSettlement));
 */
export function checkArithmetic(value: unknown, evidence = ["settlements"]): Check[] {
  return [
    check("escrow-conservation", "minerPaid + unusedEscrow + burned equals escrow in raw units", evidence, (inputs) => {
      const row = object(value, "settlement");
      const escrow = integer(row.escrow, "escrow");
      const paid = integer(row.minerPaid, "minerPaid");
      const unused = integer(row.unusedEscrow, "unusedEscrow");
      const burned = integer(row.burned, "burned");
      Object.assign(inputs, {
        escrow: row.escrow,
        minerPaid: row.minerPaid,
        unusedEscrow: row.unusedEscrow,
        burned: row.burned,
      });
      const total = paid + unused + burned;
      inputs.total = total.toString();
      inputs.difference = (total - escrow).toString();
      assert(total === escrow, `Escrow differs by ${total - escrow} raw units`);
      return pass("The reported split conserves escrow exactly. This does not prove funds moved.");
    }),
    check(
      "display-price-ratio",
      "Displayed price agrees with minerPaid / aggregateGn at its written precision",
      evidence,
      (inputs) => {
        const row = object(value, "settlement");
        const gn = integer(row.aggregateGn, "aggregateGn");
        const paid = integer(row.minerPaid, "minerPaid");
        Object.assign(inputs, {
          aggregateGn: row.aggregateGn,
          minerPaid: row.minerPaid,
          pricePerGflop: row.pricePerGflop,
        });
        if (gn === 0n) {
          assert(paid === 0n, "Nonzero payment with zero aggregateGn");
          return na("No work or payment to form a price ratio.");
        }
        const price = text(row.pricePerGflop, "pricePerGflop");
        assert(
          /^(0|[1-9]\d{0,119})(\.\d{1,18})?$/.test(price),
          "Price must be an unsigned decimal with at most 18 fractional digits",
        );
        const [whole, fraction = ""] = price.split(".");
        const scale = 10n ** BigInt(fraction.length);
        const units = BigInt(`${whole}${fraction}`);
        const residual = paid * scale - units * gn;
        inputs.scaledResidual = residual.toString();
        inputs.scale = scale.toString();
        assert(
          fraction.length === 0 ? residual === 0n : residual >= 0n && residual < gn,
          "Price is not the exact or truncated minerPaid / aggregateGn ratio",
        );
        return pass("Display-ratio consistency only. No conversion from G_n to GFLOP is established.");
      },
    ),
  ];
}

function payload(bundle: Evidence, id: string, tool: string): Record<string, unknown> {
  const obs = bundle.observations.find((o) => o.id === id);
  if (!obs) throw new Missing(`${id} observation is missing`);
  assert(obs.tool === tool, `${id} uses an unexpected tool`);
  assert(obs.source === "https://mcp.flop.network/mcp", `${id} uses an unsupported source`);
  if (obs.raw === null) throw new Missing(`${id}: ${obs.error}`);
  return object(JSON.parse(obs.raw) as unknown, id);
}

/** Find matching rows without trusting a normalized copy.
 * @example settlementRows(bundle).map(row => row.channelId);
 */
export function settlementRows(bundle: Evidence): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const obs of bundle.observations.filter((o) => o.id.startsWith("settlements:"))) {
    const data = payload(bundle, obs.id, "flop_list_settlements");
    const pagination = object(data.pagination, "pagination");
    height(pagination.total, "pagination.total");
    height(pagination.offset, "pagination.offset");
    height(pagination.limit, "pagination.limit");
    boolean(pagination.hasMore, "pagination.hasMore");
    rows.push(...array(data.data, "settlements.data").map((r) => object(r, "settlement")));
  }
  return rows;
}

function selected(bundle: Evidence): Record<string, unknown> {
  const rows = settlementRows(bundle).filter(
    (r) => hash(r.channelId, "settlement.channelId") === bundle.channelId.toLowerCase(),
  );
  if (rows.length === 0) throw new Missing("No matching settlement in the captured pages; capture is bounded");
  assert(rows.length === 1, "Duplicate settlement rows for this channel");
  return rows[0]!;
}

function same(a: unknown, b: unknown, name: string): void {
  if (a === null || a === undefined || b === null || b === undefined) throw new Missing(`${name} is missing`);
  assert(a === b, `${name} disagrees between observations`);
}

function eventInteger(value: unknown, name: string): bigint {
  const v = text(value, name);
  assert(/^(\d+|[1-9]\d{0,2}(,\d{3})+)$/.test(v), `${name} has invalid digit grouping`);
  return integer(v.replaceAll(",", ""), name);
}

/** Replay all checks locally. This function never fetches, executes code or follows a bundle URL.
 * @example const report = await verifyEvidence(JSON.parse(fileText));
 */
export async function verifyEvidence(value: unknown): Promise<Report> {
  let bundle: Evidence;
  try {
    bundle = parseEvidence(value);
    const mismatches = await integrityErrors(bundle);
    if (mismatches.length) throw new Error(`Content hash mismatch: ${mismatches.join(", ")}`);
  } catch (error) {
    const invalid = check("bundle-integrity", "Bundle schema and SHA-256 content hashes agree", [], () => {
      throw error;
    });
    invalid.status = "FAIL";
    return { channelId: "unknown", capturedAt: null, sources: [], checks: [invalid], exitCode: 1 };
  }
  const ids = bundle.observations.filter((o) => o.id.startsWith("settlements:")).map((o) => o.id);
  const checks: Check[] = [
    check(
      "bundle-integrity",
      "Bundle schema and SHA-256 content hashes agree",
      bundle.observations.map((o) => o.id),
      () => pass("Hashes match. An unsigned bundle can be edited and rehashed; this is not source authentication."),
    ),
  ];
  let row: Record<string, unknown> | undefined;
  checks.push(
    check("settlement-record", "One settlement row matches the requested channel", ids, (inputs) => {
      row = selected(bundle);
      inputs.channelId = row.channelId;
      return pass("One matching settlement in the captured pages.");
    }),
  );
  checks.push(...checkArithmetic(row, ids));
  const settlement = () => object(row, "matching settlement");
  const channel = () => {
    const c = payload(bundle, "channel", "flop_get_compute_channel");
    same(hash(c.channelId, "channel.channelId"), bundle.channelId.toLowerCase(), "channelId");
    return c;
  };
  checks.push(
    check(
      "channel-consistency",
      "Channel and tape agree on amounts, parties and work",
      ["channel", ...ids],
      (inputs) => {
        const s = settlement();
        const c = channel();
        for (const key of ["escrow", "minerPaid", "burned", "aggregateGn"]) {
          same(integer(c[key], `channel.${key}`), integer(s[key], `settlement.${key}`), key);
          inputs[key] = s[key];
        }
        for (const key of ["agent", "miner", "marketKind"]) same(text(c[key], key), text(s[key], key), key);
        return pass("The two indexed views agree. Both are served through the same public MCP.");
      },
    ),
  );
  checks.push(
    check("price-consistency", "The agreed GFLOP price and verified compute justify the payment", ids, (inputs) => {
      const s = settlement();
      inputs.aggregateGn = s.aggregateGn;
      inputs.pricePerGflop = s.pricePerGflop;
      inputs.definition =
        "G_n is the unit by which verified miner work is weighted when the miner block-reward pool is distributed.";
      inputs.references = [
        "https://docs.flop.network/docs/core-terms",
        "https://docs.flop.network/docs/tokenomics-basics",
      ];
      return unknown(
        "Missing an invertible G_n-to-GFLOP definition, per-turn compute and the agreed historical price. A derived tape ratio is not a pricing proof.",
      );
    }),
  );
  checks.push(
    check(
      "model-registry",
      "The reported model hash agrees with the captured registry and trust root",
      ["channel", "models", "trust-root", ...ids],
      (inputs) => {
        const s = settlement();
        const c = channel();
        const model = hash(s.modelHash, "settlement.modelHash");
        same(hash(c.modelHash, "channel.modelHash"), model, "modelHash");
        const models = array(payload(bundle, "models", "flop_discover_models").models, "models");
        const trust = payload(bundle, "trust-root", "flop_trust_root");
        const trusted = array(trust.models, "trust.models");
        inputs.modelHash = model;
        inputs.snapshotHash = hash(trust.snapshotHash, "trust.snapshotHash");
        assert(
          models.some((m) => hash(object(m, "model").modelHash, "modelHash") === model),
          "Model hash absent from captured discovery registry",
        );
        const match = trusted
          .map((m) => object(m, "trusted model"))
          .find((m) => hash(m.modelHash, "modelHash") === model);
        assert(match !== undefined, "Model hash absent from captured trust root");
        if (match.enforceMeasuredRoot === true) same(hash(c.measuredRoot, "measuredRoot"), model, "measuredRoot");
        return pass(
          "Hash membership matches these snapshots. This does not verify weights ran or historical registry membership.",
        );
      },
    ),
  );
  checks.push(
    check(
      "settlement-event",
      "Kind and cooperative flag agree with the indexed runtime event and extrinsic",
      ["channel", "block", "transaction", ...ids],
      (inputs) => {
        const s = settlement();
        const c = channel();
        const ref = object(c.settlement, "channel.settlement");
        const transition = object(c.latestTransition, "channel.latestTransition");
        const event = object(transition.data, "transition.data");
        const block = object(payload(bundle, "block", "flop_get_block").block, "block");
        const tx = object(payload(bundle, "transaction", "flop_indexer_query").transaction, "transaction");
        same(hash(event.channelId, "event.channelId"), bundle.channelId.toLowerCase(), "event channel");
        same(text(s.settlementKind, "settlementKind"), text(ref.kind, "settlement.kind"), "settlement kind");
        same(text(s.settlementEvent, "settlementEvent"), text(ref.event, "settlement.event"), "settlement event");
        same(ref.event, transition.event, "transition event");
        same(
          boolean(s.cooperative, "settlement.cooperative"),
          boolean(c.cooperative, "channel.cooperative"),
          "cooperative",
        );
        same(s.cooperative, boolean(event.cooperative, "event.cooperative"), "event cooperative");
        for (const key of ["minerPaid", "burned", "aggregateGn"])
          same(integer(s[key], key), eventInteger(event[key], `event.${key}`), key);
        for (const part of [ref, transition, tx]) {
          same(height(part.blockNumber, "blockNumber"), height(s.settledBlock, "settledBlock"), "block number");
          same(hash(part.blockHash, "blockHash"), hash(s.settledBlockHash, "settledBlockHash"), "block hash");
        }
        same(hash(block.hash, "block.hash"), hash(s.settledBlockHash, "settledBlockHash"), "block header hash");
        same(height(block.number, "block.number"), s.settledBlock, "block header number");
        same(height(block.timestamp, "block.timestamp"), height(s.settledAt, "settledAt"), "block timestamp");
        same(hash(tx.hash, "transaction.hash"), hash(s.extrinsicHash, "extrinsicHash"), "extrinsic hash");
        for (const part of [ref, transition]) {
          same(hash(part.extrinsicHash, "extrinsicHash"), hash(tx.hash, "tx.hash"), "extrinsic reference");
          same(
            height(part.extrinsicIndex, "extrinsicIndex"),
            height(s.extrinsicIndex, "row.extrinsicIndex"),
            "event extrinsic index",
          );
          same(height(part.eventIndex, "eventIndex"), height(s.eventIndex, "row.eventIndex"), "event index");
          same(text(part.callSection, "callSection"), text(s.callSection, "row.callSection"), "event call section");
          same(text(part.callMethod, "callMethod"), text(s.callMethod, "row.callMethod"), "event call method");
          same(height(part.timestamp, "timestamp"), height(s.settledAt, "settledAt"), "event timestamp");
        }
        same(height(tx.indexInBlock, "tx.indexInBlock"), height(s.extrinsicIndex, "extrinsicIndex"), "extrinsic index");
        same(text(tx.section, "tx.section"), text(s.callSection, "callSection"), "call section");
        same(text(tx.method, "tx.method"), text(s.callMethod, "callMethod"), "call method");
        assert(tx.success === 1, "Indexed extrinsic did not succeed");
        const args = array(JSON.parse(text(tx.args, "transaction.args")) as unknown, "transaction.args");
        same(hash(args[0], "transaction channel argument"), bundle.channelId.toLowerCase(), "transaction channel");
        Object.assign(inputs, {
          kind: s.settlementKind,
          event: s.settlementEvent,
          cooperative: s.cooperative,
          block: s.settledBlock,
          extrinsicHash: tx.hash,
        });
        if (s.settlementEvent === "computeChannel.Settled") {
          assert(s.settlementKind === "settled", "Settled runtime event has a different settlement kind");
        } else {
          return unknown(
            "Indexed references agree but this runtime event has no tested semantic mapping. No forced settlement was present in the recorded tape.",
          );
        }
        return pass("Indexed event, call and header references agree. No consensus or storage proof was checked.");
      },
    ),
  );
  checks.push(
    check(
      "assurance-tier",
      "The claimed assurance tier is supported by authenticated evidence",
      ["channel", "transaction", ...ids],
      (inputs) => {
        const s = settlement();
        const c = channel();
        const tier = text(s.assuranceTier, "assuranceTier");
        same(tier, text(c.assuranceTier, "channel.assuranceTier"), "assurance tier");
        assert(tier === "Soft" || tier === "Hard", "Unknown assurance tier");
        inputs.tier = tier;
        inputs.evidenceStatus = c.evidenceStatus ?? null;
        return unknown(
          tier === "Hard"
            ? "Missing independently authenticated hardware quote and appraisal chain. A tier label is not an attestation."
            : "Missing authenticated co-signed transcript and activation evidence. WITNESS_ONLY and signatures without verification are not proof.",
        );
      },
    ),
  );
  checks.push(
    check(
      "challenge-window",
      "Settlement dates and the challenge deadline agree with the captured head and runtime window",
      ["head", "channel-index", ...ids],
      (inputs) => {
        const s = settlement();
        const settled = height(s.settledBlock, "settledBlock");
        const at = height(s.settledAt, "settledAt");
        const head = height(
          object(payload(bundle, "head", "flop_get_stats").stats, "stats").latestBlockNumber,
          "latestBlockNumber",
        );
        const indexed = object(payload(bundle, "channel-index", "flop_indexer_query").computeChannel, "computeChannel");
        same(hash(indexed.channelId, "indexed channelId"), bundle.channelId.toLowerCase(), "indexed channelId");
        Object.assign(inputs, {
          settledBlock: settled,
          settledAt: at,
          observedHead: head,
          challengeEnd: indexed.challengeEnd ?? null,
          reference: "https://docs.flop.network/docs/protocol-parameters",
        });
        assert(head >= settled, "Settlement lies after the captured head");
        assert(at <= Date.parse(bundle.capturedAt), "Settlement timestamp lies after evidence capture");
        if (indexed.challengeEnd !== null && indexed.challengeEnd !== undefined) {
          const end = height(indexed.challengeEnd, "challengeEnd");
          assert(end >= settled, "Challenge deadline precedes settlement");
          inputs.observedBlocksRemaining = Math.max(0, end - head);
        }
        return unknown(
          "The docs specify about seven days, bounded by DA retention. Missing the exact historical runtime window and authenticated head. No exact expiry is inferred.",
        );
      },
    ),
  );
  checks.push(
    check(
      "merkle-inclusion",
      "Published transcript leaves belong to the settled root",
      ["transaction", "channel-index"],
      (inputs) => {
        const indexed = object(payload(bundle, "channel-index", "flop_indexer_query").computeChannel, "computeChannel");
        inputs.finalRoot = indexed.finalRoot ?? null;
        if (indexed.finalRoot != null) hash(indexed.finalRoot, "finalRoot");
        return unknown(
          "Missing an authoritative leaf and node encoding plus an authenticated transcript root. Published witness merklePath fields alone are not inclusion proof.",
        );
      },
    ),
  );
  checks.push(
    check(
      "tee-quote-digest",
      "The quote bytes hash to the authenticated receipt digest",
      ["channel", "receipt"],
      (inputs) => {
        const c = channel();
        const receipt = bundle.observations.find((o) => o.id === "receipt");
        for (const key of ["hashLock", "hash_lock"]) if (c[key] != null) hash(c[key], key);
        if (!receipt && c.assuranceTier === "Soft" && c.hashLock == null && c.hash_lock == null && c.teeQuote == null)
          return na("This captured Soft compute channel declares no HTLC link or hardware quote.");
        if (receipt) inputs.receipt = payload(bundle, "receipt", "flop_get_inference_receipt");
        return unknown(
          "Missing raw quote bytes with documented digest encoding and independent authentication. Receipt placeholder fields and simulated quote checks are never accepted as proof.",
        );
      },
    ),
  );
  if (bundle.version === 2) checks.push(...(await checkPublicEvidence(bundle, row)));
  return {
    channelId: bundle.channelId,
    capturedAt: bundle.capturedAt,
    sources: bundle.observations.map(({ id, source, tool, measuredAt }) => ({ id, source, tool, measuredAt })),
    checks,
    exitCode: resultCode(checks),
  };
}
