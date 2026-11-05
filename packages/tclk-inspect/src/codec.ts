// SPDX-License-Identifier: Apache-2.0
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, base64urlnopad } from "@scure/base";
import { Ajv2020 } from "ajv/dist/2020.js";
import schemaRecord from "../fixtures/schema.json";
import type { Accept, Frame, Offer, SignedRecord } from "./model";

const ajv = new Ajv2020({ strict: true, allErrors: false });
// These upstream annotations describe rail emission. They impose no JSON validation constraint.
for (const keyword of ["x-tclk-canonicalPattern", "x-tclk-canonicalIds", "x-tclk-aliases"]) ajv.addKeyword(keyword);
const schema = JSON.parse(schemaRecord.raw) as object;
const validators = new Map(
  Object.keys((schema as { $defs: object }).$defs).map((type) => [
    type,
    ajv.compile({ ...schema, oneOf: undefined, $id: undefined, $ref: `#/$defs/${type}` }),
  ]),
);

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${canonical(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value).replace(
    /[\u0080-\uffff]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
export const hex = (bytes: Uint8Array): string => `0x${bytesToHex(bytes)}`;
export const bytes = (value: string): Uint8Array => hexToBytes(value.slice(2));
export const digest = (tag: string, value: unknown): string =>
  hex(sha256(new TextEncoder().encode(`FLOP::tclk::v1|${tag}|${canonical(value)}`)));
export function offerId(offer: Omit<Offer, "id">): string {
  return digest("offer", offer);
}
export function contractId(offer: Offer, accept: Accept): string {
  const { from, ref, statement, nonce, paymentKey } = accept;
  return digest("contract", { offer, accept: { from, ref, statement, nonce, paymentKey } });
}
function point(value: string): boolean {
  try {
    secp256k1.Point.fromHex(value.slice(2)).assertValidity();
    return /^0x[0-9a-f]{66}$/.test(value);
  } catch {
    return false;
  }
}
export function opens(kind: Offer["lock"], statement: string, witness: string): boolean {
  try {
    return kind === "hash"
      ? hex(sha256(bytes(witness))) === statement
      : hex(secp256k1.getPublicKey(bytes(witness))) === statement;
  } catch {
    return false;
  }
}
export function decode(line: string): Frame {
  if (!line.startsWith("tclk1 ") || line.length > 4096 || /[^\x20-\x7e]/.test(line))
    throw new Error("frame must be one ASCII tclk1 line within 4096 characters");
  const value: unknown = JSON.parse(line.slice(6));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("frame must be an object");
  const type = (value as { type?: unknown }).type;
  if (
    typeof type !== "string" ||
    !["offer", "accept", "lock", "reveal", "refund", "cancel", "receipt", "heartbeat"].includes(type)
  )
    throw new Error("unknown frame type");
  const validate = validators.get(type)!;
  if (!validate(value))
    throw new Error(`${type}${validate.errors?.[0]?.instancePath ?? ""}: ${ajv.errorsText(validate.errors)}`);
  if (`tclk1 ${canonical(value)}` !== line) throw new Error("frame JSON is not canonical (SPEC 3)");
  const frame = value as Frame;
  if ("paymentKey" in frame && frame.paymentKey !== undefined && !point(frame.paymentKey))
    throw new Error("paymentKey is not an on-curve compressed point");
  if (frame.type === "offer") {
    const { id, ...fields } = frame;
    for (const key of ["claimByMs", "refundAfterMs", "expiresMs"] as const)
      if (!Number.isSafeInteger(frame[key])) throw new Error(`${key} is not a safe integer`);
    if (frame.claimByMs >= frame.refundAfterMs) throw new Error("claimByMs must precede refundAfterMs");
    if (frame.lock === "point" && !frame.paymentKey) throw new Error("point offer requires paymentKey");
    if (offerId(fields) !== id) throw new Error("offer id mismatch");
  }
  return frame;
}
export function statementFits(offer: Offer, accept: Accept): boolean {
  return offer.lock === "hash"
    ? /^0x[0-9a-f]{64}$/.test(accept.statement)
    : !!accept.paymentKey && point(accept.statement);
}
export function authenticate(value: unknown): SignedRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("record must be an object");
  const r = value as Record<string, unknown>;
  for (const key of ["room", "sender", "nonce", "signature", "line"])
    if (typeof r[key] !== "string") throw new Error(`record.${key} must be text; unsigned records are not commitments`);
  for (const key of ["seq", "timestampMs"])
    if (!Number.isSafeInteger(r[key]) || (r[key] as number) < 0)
      throw new Error(`record.${key} must be a non-negative safe integer`);
  const record = value as SignedRecord;
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(record.room)) throw new Error("invalid room name");
  if (!/^(0|[1-9][0-9]*)$/.test(record.nonce)) throw new Error("nonce must be canonical decimal text");
  if (!/^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/.test(record.sender))
    throw new Error("sender must be an Ed25519 did:key");
  if (!/^[A-Za-z0-9_-]{85}[AQgw]$/.test(record.signature)) throw new Error("invalid base64url signature");
  if (record.line.length > 4096) throw new Error("frame exceeds 4096 characters");
  const key = base58.decode(record.sender.slice(9));
  if (
    key.length !== 34 ||
    key[0] !== 0xed ||
    key[1] !== 1 ||
    !ed25519.verify(
      base64urlnopad.decode(record.signature),
      new TextEncoder().encode(`${record.room}|${record.nonce}|${record.line}`),
      key.slice(2),
    )
  )
    throw new Error("record signature does not verify");
  return record;
}
