// SPDX-License-Identifier: Apache-2.0
// Only public deterministic test seeds are used here. These are not chain wallets.
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58, base64urlnopad } from "@scure/base";
import { canonical, contractId, hex, offerId } from "../src/codec";
import { UPSTREAM_COMMIT, type Accept, type Frame, type Offer, type SignedRecord } from "../src/model";
const upstream = (await import(pathToFileURL(process.argv[2]!).href)) as {
  foldTranscript: (r: SignedRecord[]) => {
    steps: { ok: boolean; reason?: string }[];
    state: { status: string } | null;
  };
};
const keyA = new Uint8Array(32).fill(1),
  keyB = new Uint8Array(32).fill(2);
const did = (key: Uint8Array) => `did:key:z${base58.encode(new Uint8Array([0xed, 1, ...ed25519.getPublicKey(key)]))}`;
const a = did(keyA),
  b = did(keyB);
const epoch = Date.UTC(2026, 10, 6);
const witness = new Uint8Array(32).fill(3);
function pair(point: boolean, payee = false): [Offer, Accept] {
  const body: Omit<Offer, "id"> = {
    type: "offer",
    from: a,
    role: payee ? "payee" : "payer",
    amount: "1000",
    asset: "FLOP",
    lock: point ? "point" : "hash",
    rails: ["flop-htlc"],
    claimByMs: epoch + 10_000,
    refundAfterMs: epoch + 20_000,
    expiresMs: epoch + 5_000,
    nonce: "01010101",
    ...(point ? { paymentKey: hex(secp256k1.getPublicKey(keyA)) } : {}),
  };
  const offer: Offer = { ...body, id: offerId(body) };
  const accept: Accept = {
    type: "accept",
    from: b,
    ref: offer.id,
    statement: hex(point ? secp256k1.getPublicKey(witness) : sha256(witness)),
    contract: "",
    nonce: "02020202",
    ...(point ? { paymentKey: hex(secp256k1.getPublicKey(keyB)) } : {}),
  };
  accept.contract = contractId(offer, accept);
  return [offer, accept];
}
function signed(
  frame: Frame,
  index: number,
  contract: string,
  time = epoch + index * 1000,
  roomOverride?: string,
  lineOverride?: string,
): SignedRecord {
  const room =
    roomOverride ??
    (frame.type === "offer" || frame.type === "accept" ? "tclk-offers" : `mb-p-tclk-${contract.slice(2, 18)}`);
  const line = lineOverride ?? `tclk1 ${canonical(frame)}`;
  const nonce = String(100 + index);
  return {
    room,
    seq: index,
    timestampMs: time,
    sender: frame.from,
    nonce,
    line,
    signature: base64urlnopad.encode(
      ed25519.sign(new TextEncoder().encode(`${room}|${nonce}|${line}`), frame.from === a ? keyA : keyB),
    ),
  };
}
const paths = [
  "happy",
  "point",
  "payee-offer",
  "refund",
  "timeout",
  "expired-accept",
  "double-accept",
  "wrong-preimage",
  "late-reveal",
  "reveal-at-refund",
  "early-refund",
  "cancel-proposed",
  "cancel-accepted",
  "heartbeat",
  "receipt",
  "wrong-ref",
  "wrong-room",
  "mailbox-accept",
  "bad-signature",
  "replay-heartbeat",
  "replay-receipt",
  "noncanonical",
  "wrong-contract",
  "wrong-payer",
  "unknown-field",
];
const results = paths.map((path) => {
  const [offer, accept] = pair(path === "point", path === "payee-offer");
  const contract = accept.contract;
  const payer = offer.role === "payer" ? a : b,
    payee = payer === a ? b : a;
  const lock: Frame = { type: "lock", from: payer, contract, rail: "flop-htlc", ref: "simulated-escrow" };
  const reveal: Frame = { type: "reveal", from: payee, contract, ref: lock.ref, secret: hex(witness) };
  const refund: Frame = { type: "refund", from: payer, contract, ref: lock.ref };
  const heartbeat: Frame = { type: "heartbeat", from: payer, contract, nonce: "abababab" };
  const receipt: Frame = { type: "receipt", from: payer, contract, outcome: "claimed", ref: lock.ref, rail: lock.rail };
  let frames: Frame[] = [offer, accept, lock, reveal];
  if (path === "timeout") frames = [offer, accept, lock];
  if (path === "refund" || path === "early-refund") frames[3] = refund;
  if (path === "expired-accept") frames = [offer, accept];
  if (path === "double-accept") frames = [offer, accept, accept];
  if (path === "wrong-preimage") frames[3] = { ...reveal, secret: hex(keyA) };
  if (path === "wrong-ref") frames[3] = { ...reveal, ref: "other-escrow" };
  if (path === "wrong-contract") frames[3] = { ...reveal, contract: hex(keyA) };
  if (path === "wrong-payer") frames[2] = { ...lock, from: payee };
  if (path === "cancel-proposed") frames = [offer, { type: "cancel", from: a, contract: offer.id }];
  if (path === "cancel-accepted") frames = [offer, accept, { type: "cancel", from: a, contract }];
  if (path === "heartbeat") frames = [offer, accept, heartbeat, lock, { ...heartbeat, nonce: "cdcdcdcd" }, reveal];
  if (path === "receipt") frames.push(receipt);
  if (path === "replay-heartbeat") frames = [offer, accept, heartbeat, heartbeat];
  if (path === "replay-receipt") frames.push(receipt, receipt);
  const records = frames.map((frame, i) =>
    signed(
      frame,
      i,
      contract,
      path === "expired-accept" && i === 1
        ? offer.expiresMs
        : i === 3 && ["refund", "reveal-at-refund"].includes(path)
          ? offer.refundAfterMs
          : i === 3 && path === "late-reveal"
            ? offer.claimByMs + 1
            : epoch + i * 1000,
      path === "cancel-proposed" || (path === "wrong-room" && i === 2)
        ? "tclk-offers"
        : path === "mailbox-accept" && i === 1
          ? "mb-p-example"
          : undefined,
      path === "noncanonical" && i === 0
        ? `tclk1 ${JSON.stringify(frame)}`
        : path === "unknown-field" && i === 0
          ? `tclk1 ${canonical({ ...frame, arbiter: a })}`
          : undefined,
    ),
  );
  if (path === "bad-signature") records[2]!.line += " ";
  const folded = upstream.foldTranscript(records);
  return {
    path,
    description: "Synthetic signed rehearsal. No venue messages or payments.",
    records,
    upstream: {
      status: folded.state?.status ?? null,
      steps: folded.steps.map((s) => ({ ok: s.ok, ...(s.reason ? { reason: s.reason } : {}) })),
    },
  };
});
await writeFile(
  new URL("../fixtures/simulations.json", import.meta.url),
  JSON.stringify(
    {
      source: `https://github.com/flop-labs/tclk/tree/${UPSTREAM_COMMIT}`,
      measuredAt: new Date().toISOString(),
      commit: UPSTREAM_COMMIT,
      cases: results,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    cases: results.length,
    source: UPSTREAM_COMMIT,
    statuses: results.map((r) => [r.path, r.upstream.status, r.upstream.steps.filter((s) => !s.ok).length]),
  }),
);
