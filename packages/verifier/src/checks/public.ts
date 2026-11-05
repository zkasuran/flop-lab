// SPDX-License-Identifier: Apache-2.0
import { canonical } from "../bundle";
import { array, boolean, hash, height, integer, Missing, object, text } from "../schema";
import type { Check, Evidence, Observation } from "../types";

const SOURCE = "https://mcp.flop.network/mcp";
const unavailable = new Set(["HTLC not found or RPC unavailable.", "Receipt query failed or RPC unavailable."]);
type Data = Record<string, unknown>;
type Outcome = Pick<Check, "status" | "detail">;
const pass = (detail: string): Outcome => ({ status: "PASS", detail });
const unknown = (detail: string): Outcome => ({ status: "UNVERIFIABLE", detail });
function assert(ok: boolean, detail: string): asserts ok {
  if (!ok) throw new Error(detail);
}

function observation(bundle: Evidence, id: string, tool: string): Observation {
  const obs = bundle.observations.find((o) => o.id === id);
  if (!obs) throw new Missing(`${id} observation is missing`);
  assert(obs.tool === tool && obs.source === SOURCE, `${id} has an unexpected tool or source`);
  return obs;
}

function payload(bundle: Evidence, id: string, tool: string): Data {
  const obs = observation(bundle, id, tool);
  if (obs.raw === null) throw new Missing(`${id}: ${obs.error}`);
  if (unavailable.has(obs.raw.trim())) throw new Missing(obs.raw.trim());
  const data = object(JSON.parse(obs.raw) as unknown, id);
  if (data.errors != null) throw new Missing(`${id}: GraphQL errors: ${canonical(data.errors)}`);
  return data;
}

/** Compare every supplied view, including explicit aliases, before choosing a reference.
 * @example publicHashLock(channel, settlement);
 */
export function publicHashLock(...records: Data[]): string {
  const links = records.flatMap((r) => [r.hashLock, r.hash_lock]).filter((v) => v != null);
  if (links.length === 0) throw new Missing("No explicit public HTLC hash-lock link. A channel id is not a hash lock.");
  const hashes = links.map((v) => hash(v, "hashLock"));
  assert(
    hashes.every((v) => v === hashes[0]),
    "Public hash-lock links disagree",
  );
  return hashes[0]!;
}

function hex(value: unknown, name: string): Uint8Array<ArrayBuffer> {
  const s = text(value, name);
  assert(/^0x(?:[\da-fA-F]{2})+$/.test(s) && s.length <= 131074, `${name} must be even hex bytes, at most 64 KiB`);
  return Uint8Array.from(s.slice(2).match(/../g)!, (part) => Number.parseInt(part, 16));
}

async function sha256(value: unknown, name: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", hex(value, name));
  return `0x${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Find an inline public SDK quote envelope. URLs and opaque references are never followed.
 * @example const quote = publicQuote(channel, settlement);
 */
export function publicQuote(...records: Data[]): Data {
  const quotes = records.flatMap((r) => [r.teeQuote, r.tee_quote, r.attestation]).filter((v) => v != null);
  if (quotes.length === 0)
    throw new Missing(
      "No inline public quote envelope. Opaque attestation references cannot be resolved by the public tools.",
    );
  assert(
    quotes.every((q) => canonical(q) === canonical(quotes[0])),
    "Public quote envelopes disagree",
  );
  if (typeof quotes[0] === "string")
    throw new Missing("Only opaque quote bytes or a reference is public; the quote envelope is missing.");
  return object(quotes[0], "quote");
}

// Missing fields do not hide a disagreement in another field. Both raw values are retained.
function compare(inputs: Data, a: Data, b: Data, fields: string[], numeric: string[] = []): Outcome {
  const missing: string[] = [];
  const mismatches: string[] = [];
  for (const key of fields) {
    inputs[key] = { tool: a[key] ?? null, indexer: b[key] ?? null };
    if (a[key] == null || b[key] == null) {
      missing.push(key);
      continue;
    }
    if (numeric.includes(key)) {
      if (integer(a[key], `tool.${key}`) !== integer(b[key], `indexer.${key}`)) mismatches.push(key);
    } else {
      const validate = ["settledBlock", "settledAt", "timeout"].includes(key)
        ? height
        : key === "cooperative"
          ? boolean
          : ["channelId", "hashLock", "modelHash"].includes(key)
            ? hash
            : text;
      if (validate(a[key], `tool.${key}`) !== validate(b[key], `indexer.${key}`)) mismatches.push(key);
    }
  }
  assert(mismatches.length === 0, `Data views disagree: ${mismatches.join(", ")}. Both values are in inputs.`);
  return missing.length
    ? unknown(`Missing comparable fields: ${missing.join(", ")}`)
    : pass("Captured views agree. They share infrastructure and are not independent witnesses.");
}

/** Additional v2 checks. Runs without I/O and never treats service simulation as authentication.
 * @example await checkPublicEvidence(bundle, settlement);
 */
export async function checkPublicEvidence(bundle: Evidence, settlement: Data | undefined): Promise<Check[]> {
  const checks: Check[] = [];
  const add = async (
    id: string,
    claim: string,
    evidence: string[],
    run: (inputs: Data) => Outcome | Promise<Outcome>,
  ) => {
    const inputs: Data = {};
    try {
      checks.push({ id, claim, evidence, inputs, ...(await run(inputs)) });
    } catch (error) {
      checks.push({
        id,
        claim,
        evidence,
        inputs,
        status: error instanceof Missing ? "UNVERIFIABLE" : "FAIL",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const c = () => {
    const obs = observation(bundle, "channel", "flop_get_compute_channel");
    assert(
      hash(obs.args.channel_id, "requested channel") === bundle.channelId.toLowerCase(),
      "Channel request belongs to another subject",
    );
    const data = payload(bundle, "channel", "flop_get_compute_channel");
    assert(hash(data.channelId, "channelId") === bundle.channelId.toLowerCase(), "Channel belongs to another subject");
    return data;
  };
  const s = () => object(settlement, "settlement");
  const link = () => publicHashLock(c(), settlement ?? {});
  const quote = () => {
    const records = [c(), settlement ?? {}];
    if (bundle.observations.some((o) => o.id === "receipt")) {
      try {
        records.push(bound("receipt", "flop_get_inference_receipt"));
      } catch (error) {
        if (!(error instanceof Missing)) throw error;
      }
    }
    return publicQuote(...records);
  };
  const bound = (id: string, tool: string) => {
    const expected = link();
    const obs = observation(bundle, id, tool);
    const arg = tool === "flop_indexer_query" ? object(obs.args.variables, "variables").hash : obs.args.hash_lock;
    assert(hash(arg, `${id}.requestedHash`) === expected, `${id} request belongs to another hash lock`);
    const response = payload(bundle, id, tool);
    const data = tool === "flop_indexer_query" ? object(response.htlc, "htlc") : response;
    if (data.hashLock != null || data.hash_lock != null)
      assert(publicHashLock(data) === expected, `${id} response belongs to another hash lock`);
    return data;
  };
  const indexed = (id: string, field: string) => {
    const obs = observation(bundle, id, "flop_indexer_query");
    assert(
      hash(object(obs.args.variables, "variables").id, "requested channel") === bundle.channelId.toLowerCase(),
      `${id} requested another channel`,
    );
    const row = object(payload(bundle, id, "flop_indexer_query")[field], field);
    assert(
      hash(row.channelId, `${field}.channelId`) === bundle.channelId.toLowerCase(),
      `${field} belongs to another channel`,
    );
    return row;
  };
  const ids = bundle.observations.filter((o) => o.id.startsWith("settlements:")).map((o) => o.id);
  await add("indexer-channel", "Channel fields agree between the tool and GraphQL", ["channel", "channel-index"], (i) =>
    compare(
      i,
      c(),
      indexed("channel-index", "computeChannel"),
      [
        "channelId",
        "agent",
        "miner",
        "escrow",
        "minerPaid",
        "burned",
        "aggregateGn",
        "status",
        "marketKind",
        "modelHash",
        "assuranceTier",
        "cooperative",
      ],
      ["escrow", "minerPaid", "burned", "aggregateGn"],
    ),
  );
  await add(
    "indexer-settlement",
    "Settlement fields agree between the tape and GraphQL",
    [...ids, "settlement-index"],
    (i) =>
      compare(
        i,
        s(),
        indexed("settlement-index", "settlementPrice"),
        [
          "channelId",
          "agent",
          "miner",
          "escrow",
          "minerPaid",
          "burned",
          "unusedEscrow",
          "aggregateGn",
          "pricePerGflop",
          "settledBlock",
          "settledAt",
          "settlementKind",
          "settlementEvent",
          "cooperative",
          "modelHash",
          "assuranceTier",
        ],
        ["escrow", "minerPaid", "burned", "unusedEscrow", "aggregateGn"],
      ),
  );
  await add("htlc-link", "Public records explicitly identify the same HTLC", ["channel", ...ids], (i) => {
    i.hashLock = link();
    return pass("Explicit hash-lock references agree. No identity was guessed.");
  });
  await add(
    "indexer-htlc",
    "HTLC fields agree between the tool and GraphQL",
    ["channel", "htlc", "htlc-index", ...ids],
    (i) =>
      compare(
        i,
        bound("htlc", "flop_check_htlc"),
        bound("htlc-index", "flop_indexer_query"),
        ["hashLock", "amount", "timeout", "status", "sender", "recipient"],
        ["amount"],
      ),
  );
  await add(
    "htlc-preimage",
    "Public preimages match the explicitly declared SHA-256 hash lock",
    ["channel", "htlc", "htlc-index", "receipt", ...ids],
    async (i) => {
      const expected = link();
      i.hashLock = expected;
      const sources: Data[] = [];
      for (const [id, tool] of [
        ["htlc-index", "flop_indexer_query"],
        ["htlc", "flop_check_htlc"],
        ["receipt", "flop_get_inference_receipt"],
      ] as const) {
        try {
          sources.push(bound(id, tool));
        } catch (error) {
          if (!(error instanceof Missing)) throw error;
        }
      }
      const preimages = sources.flatMap((r) => [r.preImage, r.preimage]).filter((v) => v != null);
      if (!preimages.length) return unknown("No public preimage. A settled label does not reveal bytes.");
      // No protocol hash algorithm is guessed from the length of a hash.
      const algorithms = [c(), settlement ?? {}, ...sources].map((r) => r.hashAlgorithm).filter((v) => v != null);
      assert(
        algorithms.every((v) => v === algorithms[0]),
        "Public hash algorithm declarations disagree",
      );
      for (const preimage of preimages) hex(preimage, "preimage");
      if (!algorithms.length || algorithms.some((v) => v !== "sha256"))
        return unknown(
          "A consistent explicit SHA-256 algorithm declaration is required. Other algorithms are unsupported.",
        );
      i.computed = await Promise.all(preimages.map((v) => sha256(v, "preimage")));
      assert(
        (i.computed as string[]).every((v) => v === expected),
        "Public preimage does not hash to the linked hash lock",
      );
      return pass(
        "SHA-256 over the public hex-decoded bytes matches. This does not authenticate the algorithm declaration or chain state.",
      );
    },
  );
  await add(
    "htlc-timelock",
    "HTLC block references are consistent with the captured head",
    ["channel", "htlc-index", "head", ...ids],
    (i) => {
      const h = bound("htlc-index", "flop_indexer_query");
      const head = height(object(payload(bundle, "head", "flop_get_stats").stats, "stats").latestBlockNumber, "head");
      const timeout = height(h.timeout, "timeout");
      const block = height(h.blockNumber, "blockNumber");
      const status = text(h.status, "status");
      Object.assign(i, {
        head,
        timeout,
        blockNumber: block,
        status,
        timeoutReached: head >= timeout,
        blocksUntilTimeout: Math.max(0, timeout - head),
      });
      assert(["CREATED", "SETTLED", "REFUNDED"].includes(status), "Unknown HTLC status");
      assert(block <= head, "HTLC block lies after the captured head");
      if (status === "REFUNDED")
        assert(head >= timeout, "HTLC is reported refunded before the captured head reaches timeout");
      return pass(
        "Block ordering checked. Reaching timeout does not automatically refund an HTLC. Exact redeem boundaries and head finality are not verified.",
      );
    },
  );
  await add(
    "receipt-amount",
    "Explicit raw receipt amounts agree with the linked settlement",
    ["channel", "receipt", "htlc-index", ...ids],
    (i) => {
      const receipt = bound("receipt", "flop_get_inference_receipt");
      const htlc = bound("htlc-index", "flop_indexer_query");
      const row = s();
      const outcome = compare(
        i,
        { escrow: htlc.amount, minerPaid: receipt.minerPaid },
        row,
        ["escrow", "minerPaid"],
        ["escrow", "minerPaid"],
      );
      if (outcome.status === "PASS")
        return unknown(
          "Reported raw amounts agree, but receipt amount fields are service placeholders. No payment proof is established.",
        );
      return outcome;
    },
  );
  await add(
    "htlc-amount",
    "The linked HTLC amount agrees with settlement escrow in raw units",
    ["channel", "htlc-index", ...ids],
    (i) => compare(i, { escrow: bound("htlc-index", "flop_indexer_query").amount }, s(), ["escrow"], ["escrow"]),
  );
  await add(
    "quote-structure",
    "The public SDK quote envelope has the required fields and hex encodings",
    ["channel", "receipt", ...ids],
    (i) => {
      const q = quote();
      i.version = text(q.version, "quote.version");
      if (q.version !== "1.0") return unknown("Unsupported SDK quote envelope version");
      const ref = object(q.task_reference, "task_reference");
      const att = object(q.attestation, "attestation");
      const output = object(q.compute_output, "compute_output");
      assert(hash(ref.htlc_hash_lock, "quote hash lock") === link(), "Quote references another HTLC");
      text(ref.model_hash, "model_hash");
      height(ref.task_timestamp, "task_timestamp");
      assert(
        text(q.miner_address, "miner_address") === text(c().miner, "channel.miner"),
        "Quote miner disagrees with channel",
      );
      height(output.gn_weight, "gn_weight");
      height(output.execution_time_ms, "execution_time_ms");
      hex(output.encrypted_result, "encrypted_result");
      hex(att.hardware_pubkey, "hardware_pubkey");
      hex(att.signature, "signature");
      i.quoteBytes = hex(att.quote_hex, "quote_hex").length;
      i.platform = text(att.tee_type, "tee_type");
      return pass(
        "SDK envelope structure only. Raw hardware quote internals, signatures and certificate chains are not verified.",
      );
    },
  );
  await add(
    "quote-digest",
    "Hex-decoded quote bytes match an explicitly SHA-256-labelled receipt digest",
    ["channel", "receipt", ...ids],
    async (i) => {
      const att = object(quote().attestation, "attestation");
      const receipt = bound("receipt", "flop_get_inference_receipt");
      i.reported = receipt.teeQuoteDigest ?? null;
      i.algorithm = receipt.teeQuoteDigestAlgorithm ?? null;
      i.computed = await sha256(att.quote_hex, "quote_hex");
      const expected = hash(receipt.teeQuoteDigest, "teeQuoteDigest");
      if (receipt.teeQuoteDigestAlgorithm !== "sha256")
        return unknown("No supported explicit digest algorithm. Hashing conventions are not inferred.");
      assert(expected === i.computed, "Quote bytes disagree with the receipt digest");
      return pass("Declared SHA-256 byte digest agrees. The receipt and hardware signature are not authenticated.");
    },
  );
  await add(
    "attestation-trust",
    "Platform and measurement have a supported trust-root binding",
    ["channel", "receipt", "trust-root", ...ids],
    (i) => {
      const root = payload(bundle, "trust-root", "flop_trust_root");
      i.snapshotHash = hash(root.snapshotHash, "snapshotHash");
      const keys = array(root.dstackVkeys, "dstackVkeys");
      i.dstackVkeys = keys;
      if (!keys.length)
        return unknown("Captured trust root has empty dstackVkeys. No public measurement binding can be established.");
      const att = object(quote().attestation, "attestation");
      i.platform = text(att.tee_type, "tee_type");
      i.measurement = hash(att.measurement_hash, "measurement_hash");
      // Only explicit platform/measurement pairs can be compared. Opaque VKs are not measurements.
      const bindings = keys.filter(
        (key): key is Data => typeof key === "object" && key !== null && !Array.isArray(key),
      );
      if (
        bindings.length !== keys.length ||
        bindings.some((key) => key.platform == null || key.measurementHash == null)
      )
        return unknown(
          "Opaque dstack verification keys have no supported platform-to-measurement binding. No measurement is inferred from a key.",
        );
      const matches = bindings.map((key) => ({
        platform: text(key.platform, "binding.platform"),
        measurement: hash(key.measurementHash, "binding.measurementHash"),
      }));
      i.bindings = matches;
      assert(
        matches.some((key) => key.platform === i.platform && key.measurement === i.measurement),
        "Quote platform and measurement are absent from the explicit trust-root bindings",
      );
      return unknown(
        "Explicit platform and measurement labels agree. The quote, trust root and appraisal chain remain unauthenticated. This binding shape has synthetic fixture coverage only.",
      );
    },
  );
  await add(
    "attestation-tcb",
    "The TCB response is for the quote's declared platform and version",
    ["channel", "receipt", "tcb", ...ids],
    (i) => {
      const att = object(quote().attestation, "attestation");
      const platform = text(att.tee_type, "tee_type");
      const labels: Record<string, string> = {
        "intel-sgx": "Intel SGX",
        "aws-nitro": "AWS Nitro",
        "amd-sev": "AMD SEV",
      };
      if (!labels[platform]) return unknown(`The TCB tool has no supported query for ${platform}`);
      const obs = observation(bundle, "tcb", "flop_get_tcb_status");
      const tcb = payload(bundle, "tcb", "flop_get_tcb_status");
      Object.assign(i, {
        quotePlatform: platform,
        requestedPlatform: obs.args.platform,
        reportedPlatform: tcb.platform,
        requestedVersion: obs.args.tcb_version ?? null,
        reportedVersion: tcb.queriedTCBVersion ?? null,
        currentLevel: tcb.currentLevel ?? null,
      });
      assert(obs.args.platform === platform && tcb.platform === labels[platform], "TCB platform disagrees with quote");
      if (att.tcb_version == null)
        return unknown("Quote has no TCB version. Platform-level advisory data is not a quote appraisal.");
      const version = text(att.tcb_version, "tcb_version");
      assert(obs.args.tcb_version === version && tcb.queriedTCBVersion === version, "TCB version disagrees with quote");
      assert(
        tcb.currentLevel !== "Vulnerable" && tcb.currentLevel !== "vulnerable" && tcb.currentLevel !== 3,
        "The service reports a vulnerable TCB",
      );
      return unknown(
        "Platform and version agree with the captured advisory. No authenticated quote-specific collateral or revocation chain was checked.",
      );
    },
  );
  await add("tee-service-simulation", "Simulated service output is excluded from proof", ["tee-simulation"], (i) => {
    const obs = bundle.observations.find((o) => o.id === "tee-simulation");
    if (!obs)
      return unknown("flop_verify_tee_quote is documented as simulated. It was not called and cannot add a pass.");
    i.answer = payload(bundle, "tee-simulation", "flop_verify_tee_quote");
    return unknown(
      "Simulated by the service. Even verified:true is not cryptographic verification and cannot add a pass.",
    );
  });
  checks[checks.length - 1]!.simulated = true;
  return checks;
}
