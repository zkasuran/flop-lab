// SPDX-License-Identifier: Apache-2.0
import type { Coverage, Rule } from "./types";

const scope = (violation: string, boundary: string, ...checks: string[]): Coverage => ({ violation, boundary, checks });
const v = (id: string) => `verifier:${id}`;
const s = (id: string) => `spec:${id}`;
const money = [v("escrow-conservation"), "indexer:escrow-*"];
const close = [v("settlement-event"), v("challenge-window")];
const attestation = [v("assurance-tier"), v("attestation-trust"), v("attestation-tcb")];
const finality = ["indexer:finality-lag"];

// These are evidence plans, not assertions that any failure has occurred.
const plans: Record<string, Coverage> = {
  "INV-02": scope(
    "Finalized session debits exceed the authorized cap.",
    "Public records omit the versioned session cap and complete delegate debit history.",
  ),
  fail_task: scope(
    "An unauthorized reporter successfully fails a current task.",
    "The quoted call was removed. No current call is bound by this rule.",
  ),
  "INV-S01": scope(
    "A finalized session accepts a reused or decreasing nonce.",
    "The suite lacks authenticated session nonce history and rejected-call traces.",
  ),
  "INV-M06": scope(
    "A failed settlement leaves one payout leg committed.",
    "Reported escrow arithmetic is checkable. Atomic rollback needs same-block balance proofs for every leg and a failed settlement.",
    ...money,
  ),
  Supply: scope(
    "Authenticated issuance exceeds the cap or rewards rise at a halving.",
    "The indexer cannot enumerate all balances at one finalized hash. Catalog agreement does not prove emission enforcement.",
    "indexer:supply",
    s("halving_interval_blocks"),
  ),
  HTLC: scope(
    "A linked swap completes without its preimage, breaks its timelock or loses principal.",
    "The verifier checks explicitly linked public HTLC fields. Both-chain finality and atomic completion remain outside this sample.",
    v("htlc-link"),
    v("htlc-preimage"),
    v("htlc-timelock"),
    v("htlc-amount"),
  ),
  Channel: scope(
    "A channel pays twice or its terminal split fails to conserve escrow.",
    "Arithmetic and duplicate rows within the captured page are checkable. Complete no-double-settle history requires authenticated events.",
    ...money,
    v("settlement-record"),
  ),
  DA: scope(
    "A certified shard fails a retrievability challenge without its required response.",
    "Public surfaces omit shard bytes, custody challenges and authenticated serve-or-slash outcomes.",
  ),
  "R11.2": scope(
    "Payout accepts aggregate work beyond a bound active at that block.",
    "Public calibration metadata lacks the finalized acceptance and lease window. Plausibility bounds are not execution proof.",
    "indexer:calibration-window",
  ),
  "R11.2a": scope(
    "Settlement accepts invalid turn signatures, repeated indices, invalid paths or a wrong work sum.",
    "The suite reports missing authenticated transcript encoding and roots. Published witness fields alone are insufficient.",
    v("merkle-inclusion"),
    v("assurance-tier"),
  ),
  "R11.2b": scope(
    "A payment-only receipt increments public reward, vesting or committee work state.",
    "A complete finalized before/after storage diff is absent. A leaderboard value alone cannot attribute credit to a payout.",
  ),
  "S11-1": scope(
    "A proven collusion verdict applies a different slash or permits re-entry.",
    "The spec differ checks the quoted slash parameter only. Verdict, destination and blacklist state need authenticated history.",
    s("slash_fraud_percent"),
  ),
  "S11-2": scope(
    "Equivocation penalties, destination or re-entry differ from the correlated rule.",
    "Catalog comparisons do not establish correlated offender sets, actual deductions or return timing.",
    s("slash_equivocation_lone_percent"),
  ),
  "S11-3": scope(
    "A proven evidence forgery leaves collateral or permits re-entry.",
    "The public sample has no authenticated forgery verdict and complete penalty balance changes.",
  ),
  "S11-4": scope(
    "An upheld HARD-tier attestation fault avoids the stated penalty.",
    "Attestation consistency is available, but a penalty requires a fault verdict and authenticated slash events.",
    ...attestation,
  ),
  "S11-5": scope(
    "Downtime past the threshold avoids jail or the specified deduction.",
    "Catalog values can be compared. Validator liveness history and jail transitions are missing.",
    s("slash_liveness_percent"),
  ),
  "S11-6": scope(
    "Extended downtime avoids the specified slash, kick or top-up requirement.",
    "The catalog can be compared, but complete downtime and rejoin state are absent.",
    s("validator_extended_downtime_slash_percent"),
  ),
  "R13.0": scope(
    "A degraded-state repair pays a miner using missing or stale evidence.",
    "A settlement label cannot establish the evidence and clocks active during a fault. A controlled fault trace is absent.",
  ),
  "R13.0a": scope(
    "A finality-clocked deadline advances while finalized head is stalled.",
    "Reported lag arithmetic is checkable. A dated lag is not a time series of authenticated deadline storage.",
    ...finality,
  ),
  "R13.0b": scope(
    "Temporary DA loss extends a channel twice or pays/slashes without evidence.",
    "No authenticated DA-loss episode, extension counter and channel transition series is exposed.",
  ),
  "R13.0c": scope(
    "Unrecoverable DA pays a miner, loses the refund or slashes for missing evidence.",
    "Escrow arithmetic is checkable, but no repair-threshold verdict binds this recorded payout to a DA-loss episode.",
    ...money,
  ),
  "R13.0d": scope(
    "Settlement accepts an expired attestation without a valid recovery path.",
    "Attestation fields and trust material are inspected. Historical appraisal and freshness at settlement remain unavailable.",
    ...attestation,
  ),
  "R13.0e": scope(
    "An attestation outage pauses unrelated channels or exceeds the permitted cap.",
    "The cap catalog is checkable. Fault-window and per-channel pause history are absent.",
    s("attestation_outage_pause_cap_blocks"),
  ),
  "R13.0f": scope(
    "A blocked governance proposal changes state through an implicit fallback.",
    "The public sample lacks proposal execution, versioned parameter storage and fallback traces.",
  ),
  M1: scope(
    "An accepted model measurement disagrees with the authorized registry root.",
    "Registry membership is checked in public views. Correct hash membership does not prove which weights ran.",
    v("model-registry"),
    "harness:model-registry",
  ),
  M2: scope(
    "Accepted work exceeds active bounds or transcript recomputation contradicts it.",
    "Calibration window data and authenticated replay are missing. Payment ratios do not validate execution.",
    "indexer:calibration-window",
    v("merkle-inclusion"),
  ),
  M3: scope(
    "An accepted turn has a forged signature, reused index or wrong Merkle path.",
    "Authenticated co-signed turns and authoritative transcript encoding are absent.",
    v("merkle-inclusion"),
    v("assurance-tier"),
  ),
  M4: scope(
    "Settlement pays despite unavailable certified data or an unanswered dispute.",
    "No public DA retrieval transcript, availability certificate or complete dispute-response trace is available.",
  ),
  M5: scope(
    "A crashed session pays beyond its highest co-signed cumulative receipt.",
    "The suite compares indexed settlement events. It lacks the client's last acknowledged receipt and unacked tail.",
    ...close,
  ),
  M6: scope(
    "An agreed latency breach omits the signed rebate or falsely claims timing.",
    "Client timing, agreed SLA and signed breach receipt are not exposed. Gateway response time is not miner inference latency.",
  ),
  M7: scope(
    "An honest Ghost-Task miss receives a fraud penalty or exceeds its escrow bound.",
    "Ghost answers, task validity, fault attribution and bound-specific penalty events are absent.",
  ),
  M8: scope(
    "A miner selectively rejects otherwise equivalent eligible requests.",
    "Matching is off-chain. Repeated controlled requests and an enforceable censorship policy are absent; the paper marks a gap.",
  ),
  M9: scope(
    "A close path pays a split inconsistent with the selected tariff and signed receipt.",
    "Event and escrow consistency are checked. The agreed close rule and full receipt are absent; the paper gives no completion SLA.",
    ...money,
    ...close,
  ),
  M10: scope(
    "An upheld TOPLOC mismatch fails to refund, slash and close the channel.",
    "No calibrated activation band, signed mismatch quorum and linked verdict is exposed.",
  ),
  M11: scope(
    "A miner unbonds while its session or dispute remains open.",
    "A same-block history of open obligations, unbonding and slash-lock storage is missing.",
  ),
  M12: scope(
    "An identity bypasses a required bond, work or liveness barrier.",
    "Public addresses do not reveal common control or time-sliced hardware. Sybil resistance cannot be inferred from address counts.",
  ),
  M13: scope(
    "A deliberately low calibration baseline produces unearned vesting credit.",
    "Calibrated benchmark truth and timing canaries are absent. The quoted response is explicitly a gap.",
    "indexer:calibration-window",
  ),
  M14: scope(
    "An enclave side channel exposes private session data.",
    "The paper assumes vendor silicon and names no protocol detector. Public attestation cannot establish absence of data exfiltration.",
  ),
  M15: scope(
    "The same task obtains credit twice despite its replay guard.",
    "The public sample has no complete ProcessedTasks history and authenticated task-credit events.",
  ),
  M16: scope(
    "A model with pinned policies accepts an unauthorized decode policy.",
    "Pinned historical policy sets and executed decode transforms are missing. Non-identity semantics remain a source gap.",
  ),
  V1: scope(
    "Observed validator downtime produces a penalty or recovery different from the rule.",
    "Only penalty parameters are compared. Liveness observations and jail/rejoin storage are not authenticated.",
    s("slash_liveness_percent"),
    s("validator_extended_downtime_slash_percent"),
  ),
  V2: scope(
    "Proven equivocation receives the wrong correlated penalty or re-entry treatment.",
    "Catalog values do not reveal the offender set, balance movements or return schedule.",
    s("slash_equivocation_lone_percent"),
  ),
  V3: scope(
    "A failed custody audit permits settlement before data is restored.",
    "Shard challenges, signed answers and availability transitions are not exposed.",
  ),
  V4: scope(
    "Unrecoverable DA bypasses the refund or causes a fraud slash.",
    "The sample can check a reported escrow split, not establish a DA failure and repair deadline.",
    ...money,
  ),
  V5: scope(
    "A fake co-signed proof survives independent replay without the stated consequences.",
    "No independent re-execution trace, collusion verdict and authenticated slash/refund history is available.",
  ),
  V6: scope(
    "An eligible transaction is censored beyond a required inclusion obligation.",
    "The paper identifies missing inclusion monitoring and wiring. Public absence does not prove censorship.",
  ),
  V7: scope(
    "Reordering dispute and finalize at one finalized head changes the protected payout.",
    "The suite checks event and deadline consistency. Counterfactual ordering needs runtime execution at the same authenticated state.",
    ...close,
  ),
  V8: scope(
    "A leader awards itself work using malformed or self-graded Ghost Tasks.",
    "Task assignment, committed answers and on-chain well-formedness checks are a stated gap.",
  ),
  V9: scope(
    "Rotation selects a lower-stake candidate over an eligible higher-stake candidate.",
    "Complete eligible sets, performance floors and historical selection state are absent.",
  ),
  V10: scope(
    "An audit accepts a response that does not bind possession of the challenged shard.",
    "The public API omits audit identifiers, shard bytes and signed answers.",
  ),
  V11: scope(
    "A validator exits while obligations remain slashable.",
    "Validator freeze and lifetime composition are explicitly open. Complete retention, audit and exit histories are missing.",
  ),
  V12: scope(
    "Committee selection differs from the eligible weighted draw or admits undue seed influence.",
    "A committee count is not an adversarial capture bound. Eligible snapshots, randomness proofs and seed-influence analysis are absent.",
  ),
  O1: scope(
    "A quorum outage globally halts unrelated clocks or permits stale settlement.",
    "Attestation fields and the outage-cap catalog are checked. A fault-window trace is absent.",
    ...attestation,
    s("attestation_outage_pause_cap_blocks"),
  ),
  O2: scope(
    "A colluding quorum signs a false attestation.",
    "This breaks the stated BFT assumption. Counting signatures cannot establish honest appraisal.",
  ),
  O3: scope(
    "Validators selectively decline one miner's valid proofs.",
    "Per-validator request/response history and attributable liveness evidence are missing.",
  ),
  O4: scope(
    "A sub-threshold compromised set alone authorizes a bundle.",
    "The suite lacks historical active-set membership and independently validated bundle signatures.",
    v("attestation-trust"),
  ),
  F1: scope(
    "A stalled finalized head becomes best-block finality or advances protected deadlines.",
    "Reported lag is a consistency signal only. The full freeze and recovery transition needs authenticated state history.",
    ...finality,
  ),
  F2: scope(
    "Conflicting finalizations occur after the Byzantine-seat safety premise fails.",
    "Validator honesty and conflicting signed finality certificates are not exposed.",
  ),
  F3: scope(
    "A light client accepts an expired or invalid bootstrap checkpoint.",
    "The suite has no checkpoint-verifier transcript and versioned authority-set proof.",
  ),
  F4: scope(
    "Block production stops despite available secondary-slot authors.",
    "Recent linked blocks are checkable. Author availability and historical slot eligibility are not exposed.",
    "indexer:block-order",
  ),
  F5: scope(
    "A partition without sufficient quorum finalizes or triggers best-head payout.",
    "Reported finality arithmetic is checkable. No partition trace, quorum signatures or protected economic state history is available.",
    ...finality,
  ),
  A1: scope(
    "An identity exceeds reservation or block caps without rejection.",
    "Complete per-identity reservation and mempool state at a finalized version is absent.",
  ),
  A2: scope(
    "A unilateral settlement succeeds before its required window or uses the wrong path.",
    "Event references and dates are checked. Exact historical window enforcement is not authenticated.",
    ...close,
  ),
  A3: scope(
    "A dismissed false dispute returns a bond that should be forfeited.",
    "No linked dismissal verdict, bond balance and destination proof is exposed.",
  ),
  A4: scope(
    "A delegate spends beyond its authorized cap, after expiry or after revocation.",
    "Public records omit session authorizations, complete debit histories and circuit-breaker state.",
  ),
  A5: scope(
    "Demand-side identities fabricate independent demand to influence the mechanism.",
    "Address counts cannot establish control, intent or genuine demand. The quoted gauges require an attribution model.",
  ),
  A6: scope(
    "A terminal channel leaves expired model weights pinned.",
    "Complete model pin references and terminal transition storage are absent.",
  ),
  A7: scope(
    "A client crash changes the unilateral tariff or adds an extra charge.",
    "Recorded event and escrow consistency can be checked. The final receipt and crash-specific close trace are absent.",
    ...money,
    ...close,
  ),
  A8: scope(
    "An owner key rotates without the required guardians or timelock.",
    "Recovery wiring is a stated gap. Guardian authorization and rotation traces are not exposed.",
  ),
  A9: scope(
    "An adversarial payload escapes its claimed isolation boundary.",
    "No attack trace or independent isolation test is available. Attestation is not a proof of application safety.",
  ),
  A10: scope(
    "Dust fragmentation exceeds the per-identity reservation count.",
    "The public sample lacks a complete identity reservation set and active cap storage.",
  ),
  P1: scope(
    "An in-use model is pruned or an idle expired lease loses its refundable deposit.",
    "Model pins, lease expiry and same-block deposit/refund proofs are not exposed.",
  ),
  P2: scope(
    "Published weights contain a backdoor or poisoned behavior.",
    "Model quality is explicitly outside protocol scope. A matching root cannot establish model quality.",
  ),
  P3: scope(
    "A model name claims a publisher that did not authorize the artifact.",
    "Publisher namespaces and transparency provenance wiring are a stated gap. A name is not authenticated provenance.",
  ),
  P4: scope(
    "A publisher distributes weights without the required license rights.",
    "License compliance is explicitly outside protocol scope and cannot be decided from a hash.",
  ),
  I1: scope(
    "A session TLS endpoint presents a key different from the opened enclave key.",
    "The public API omits the actual RA-TLS handshake and authenticated open_channel key binding.",
  ),
  I2: scope(
    "Discovery censorship prevents an otherwise valid on-chain escape path.",
    "Off-chain matching requests and an exercised force-open/settle path are absent. Listing models cannot test escape availability.",
  ),
  I3: scope(
    "The legacy miner-hosted quote path is enabled despite its default-off profile.",
    "Gateway deployment flags and miner-hosted fallback traces are not publicly exposed.",
  ),
};

/** Resolve a reviewed evidence plan. New paper rows remain explicit gaps. @example coverageFor(rule).checks */
export function coverageFor(rule: Rule): Coverage {
  return (
    plans[rule.id] ??
    scope(
      "A finalized execution contradicts the quoted rule.",
      "Not observable from outside with the current mapping: this source row has not been reviewed. No check is inferred from its words.",
    )
  );
}

/** Reviewed rule identifiers, used to detect source changes. @example reviewedIds().includes("M1") */
export function reviewedIds(): string[] {
  return Object.keys(plans);
}
