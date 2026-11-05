// SPDX-License-Identifier: Apache-2.0
import { authenticate, contractId, decode, opens, statementFits } from "./codec";
import { SPEC_URL, type Deal, type Frame, type Inspection, type Step } from "./model";

const sections: Record<Frame["type"], string> = {
  offer: "3.1",
  accept: "3.2",
  lock: "3.3",
  reveal: "3.4",
  refund: "3.5",
  cancel: "3.5",
  receipt: "3.5",
  heartbeat: "3.6",
};
const requireGuard = (ok: boolean, reason: string) => {
  if (!ok) throw new Error(reason);
};
const normalized = (rail: string): string => (["PaperRail", "paperrail", "paper-rail"].includes(rail) ? "paper" : rail);

function advance(state: Deal | null, frame: Frame, now: number): Deal {
  if (frame.type === "offer") {
    requireGuard(state === null, "contract is already open");
    return {
      status: "proposed",
      offer: frame,
      ...(frame.role === "payer" ? { payer: frame.from } : { payee: frame.from }),
    };
  }
  requireGuard(state !== null, "no contract open yet");
  const s = state!;
  if (frame.type === "accept") {
    requireGuard(s.status === "proposed", `accept in status ${s.status}`);
    requireGuard(frame.ref === s.offer.id, "accept.ref names a different offer");
    requireGuard(frame.from !== s.offer.from, "cannot accept own offer");
    requireGuard(now < s.offer.expiresMs, "offer has expired");
    requireGuard(frame.contract === contractId(s.offer, frame), "contract id mismatch");
    requireGuard(statementFits(s.offer, frame), `statement or paymentKey does not fit ${s.offer.lock} lock`);
    return {
      ...s,
      status: "accepted",
      contract: frame.contract,
      statement: frame.statement,
      ...(s.offer.role === "payer" ? { payee: frame.from } : { payer: frame.from }),
    };
  }
  // A proposed cancel has no accepted contract id. Bind it to the offer id, see issue 5.
  requireGuard(frame.contract === (s.contract ?? s.offer.id), `${frame.type} names a different contract`);
  requireGuard(frame.from === s.payer || frame.from === s.payee, `${frame.type} from a non-party`);
  switch (frame.type) {
    case "lock":
      requireGuard(s.status === "accepted", `lock in status ${s.status}`);
      requireGuard(frame.from === s.payer, "only the payer locks");
      requireGuard(now < s.offer.refundAfterMs, "refund window is already open");
      requireGuard(
        s.offer.rails.some((rail) => normalized(rail) === normalized(frame.rail)),
        "rail was not offered",
      );
      return { ...s, status: "locked", rail: frame.rail, railRef: frame.ref };
    case "reveal":
    case "refund": {
      requireGuard(s.status === "locked", `${frame.type} in status ${s.status}`);
      requireGuard(frame.ref === undefined || frame.ref === s.railRef, `${frame.type} names a different rail ref`);
      requireGuard(
        frame.from === (frame.type === "reveal" ? s.payee : s.payer),
        frame.type === "reveal" ? "only the payee reveals" : "only the payer refunds",
      );
      if (frame.type === "reveal") {
        requireGuard(now < s.offer.refundAfterMs, "refund window is open");
        requireGuard(opens(s.offer.lock, s.statement!, frame.secret), "witness does not open the statement");
        return { ...s, status: "claimed" };
      }
      requireGuard(now >= s.offer.refundAfterMs, "refund window not open yet");
      return { ...s, status: "refunded" };
    }
    case "cancel":
      requireGuard(s.status === "proposed" || s.status === "accepted", `cancel in status ${s.status}`);
      return { ...s, status: "cancelled" };
    case "heartbeat":
      requireGuard(s.status === "accepted" || s.status === "locked", `heartbeat in status ${s.status}`);
      return s;
    case "receipt":
      requireGuard(["claimed", "refunded", "cancelled"].includes(s.status), "receipt before a terminal status");
      requireGuard(frame.outcome === s.status, "receipt outcome does not match terminal state");
      requireGuard(frame.rail === undefined || frame.rail === s.rail, "receipt rail does not match contract rail");
      requireGuard(frame.ref === undefined || frame.ref === s.railRef, "receipt ref does not match contract rail ref");
      return s;
  }
}

/** Inspect ordered normalized signed records. Example: inspectTranscript(simulate("happy")).verdict. */
export function inspectTranscript(input: unknown, source = "provided transcript"): Inspection {
  const report: Inspection = {
    verdict: "no-data",
    state: null,
    steps: [],
    firstViolation: null,
    inspectedAt: new Date().toISOString(),
    source,
    spec: SPEC_URL,
    limits: [
      "The export supplies time and append order. Signatures do not authenticate either.",
      "Conformant means the supplied records pass these checks. It does not prove a complete history, payment or work quality.",
      "Mailbox accepts are rejected under SPEC 2 room binding; upstream issue 198 tracks the conflicting alternative.",
      "Arbitration and adaptor presignature verification are not established by this transcript.",
    ],
  };
  const rows: unknown = Array.isArray(input)
    ? input
    : input && typeof input === "object"
      ? (input as { records?: unknown }).records
      : null;
  if (!Array.isArray(rows) || rows.length > 500) {
    const step: Step = {
      index: -1,
      type: "input",
      from: "none",
      to: "none",
      ok: false,
      section: "2",
      reason: "expected an array of at most 500 normalized signed records (or an object with records)",
      warnings: [],
    };
    return { ...report, verdict: "violation", steps: [step], firstViolation: step };
  }
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const step: Step = {
      index,
      type: "record",
      from: report.state?.status ?? "none",
      to: report.state?.status ?? "none",
      ok: false,
      section: "2",
      warnings: [],
    };
    try {
      const r = authenticate(row);
      step.timestampMs = r.timestampMs;
      step.sender = r.sender;
      step.section = "3";
      const f = decode(r.line);
      step.type = f.type;
      step.section = "2";
      requireGuard(f.from === r.sender, "frame.from does not match signed sender");
      const room =
        f.type === "offer" || f.type === "accept" || !report.state?.contract
          ? "tclk-offers"
          : `mb-p-tclk-${report.state.contract.slice(2, 18)}`;
      requireGuard(r.room === room, `${f.type} must be posted in ${room}`);
      step.section = "4";
      const fingerprint = `${r.sender}|${r.line}`;
      requireGuard(!seen.has(fingerprint), "duplicate frame or replay");
      step.section = sections[f.type];
      report.state = advance(report.state, f, r.timestampMs);
      seen.add(fingerprint);
      step.ok = true;
      step.to = report.state.status;
      if (f.type === "reveal" && r.timestampMs > report.state.offer.claimByMs)
        step.warnings.push("Late reveal: after claimByMs but before refundAfterMs. The rail arbitrates (SPEC 3.4).");
      if (f.type === "lock" && ["memory", "paper"].includes(normalized(f.rail)))
        step.warnings.push("Rehearsal rail. This announcement does not establish external value.");
      if (f.type === "lock" && f.presig)
        step.warnings.push("Adaptor presignature shape checked only; no rail claim message is supplied.");
      if (f.type === "cancel" && !report.state.contract)
        step.warnings.push(
          "Proposed cancel binds to offer.id under the inspector's conservative rule. SPEC 3.5 does not define this id (issue 5).",
        );
    } catch (error) {
      step.reason = error instanceof Error ? error.message : "invalid record";
      if (!report.firstViolation) report.firstViolation = step;
    }
    report.steps.push(step);
  }
  report.verdict = report.firstViolation ? "violation" : rows.length ? "conformant" : "no-data";
  return report;
}

/** Parse a bounded JSON transcript without coercion. Example: parseTranscript('[ ]'). */
export function parseTranscript(text: string): unknown {
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error("transcript exceeds 2000000 bytes");
  return JSON.parse(text) as unknown;
}
