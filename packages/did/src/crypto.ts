// SPDX-License-Identifier: Apache-2.0
import { ed25519 } from "@noble/curves/ed25519.js";

const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export type Verdict = { status: "verified" | "invalid" | "unverifiable"; reason: string };

/** Decode a canonical base58btc Ed25519 key. Example: decodeDidKey(did). */
export function decodeDidKey(did: string): Uint8Array<ArrayBuffer> {
  if (typeof did !== "string" || !/^did:key:z[1-9A-HJ-NP-Za-km-z]{47}$/.test(did))
    throw new Error("Expected a canonical base58btc Ed25519 did:key");
  let value = 0n;
  for (const ch of did.slice(9)) value = value * 58n + BigInt(alphabet.indexOf(ch));
  const bytes: number[] = [];
  while (value) {
    bytes.unshift(Number(value & 255n));
    value >>= 8n;
  }
  if (bytes.length !== 34 || bytes[0] !== 0xed || bytes[1] !== 1)
    throw new Error("DID must have the ed01 Ed25519 multicodec prefix");
  return new Uint8Array(bytes.slice(2));
}

/** Hash the exact DID string. Example: await fingerprint(did). */
export async function fingerprint(did: string): Promise<string> {
  decodeDidKey(did);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(did)));
  return Array.from(hash.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Apply the server's single-line sweep without Unicode normalization. Example: sweep("a\nb") === "a b". */
export function sweep(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu, " ").trim();
}

/** Validate a room or namespace component. Example: name("technocore"). */
export function name(value: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(value)) throw new Error("Invalid room or note name");
  return value;
}

function nonceText(nonce: string): string {
  if (typeof nonce !== "string" || !/^[0-9]{1,19}$/.test(nonce)) throw new Error("Nonce must be 1 to 19 exact digits");
  return nonce;
}

/** Build exact signed message bytes as text. Example: messagePayload("lobby", "1", "hello"). */
export function messagePayload(room: string, nonce: string, text: string): string {
  const clean = sweep(text);
  if (!clean || [...clean].length > 4096) throw new Error("Message is empty or exceeds the character limit");
  return `${name(room)}|${nonceText(nonce)}|${clean}`;
}

/** Build signed note bytes. Example: notePayload("room-owners", "d-demo", "1", did). */
export function notePayload(ns: string, key: string, nonce: string, value: string): string {
  const clean = sweep(value);
  if (!clean || [...clean].length > 8192) throw new Error("Note is empty or exceeds the character limit");
  return `${name(ns)}|${name(key)}|${nonceText(nonce)}|${clean}`;
}

/** Verify exact bytes with WebCrypto after strict point checks. Example: await verifySignature(did, payload, sig). */
export async function verifySignature(
  did: string,
  payload: string,
  signature?: string,
  tamper = false,
): Promise<Verdict> {
  if (signature === undefined) return { status: "unverifiable", reason: "No signature retained by the source" };
  try {
    const publicKey = decodeDidKey(did);
    if (!/^[A-Za-z0-9_-]{85}[AQgw]$/.test(signature)) throw new Error("Signature is not canonical unpadded base64url");
    const raw = Uint8Array.from(atob(signature.replaceAll("-", "+").replaceAll("_", "/") + "=="), (c) =>
      c.charCodeAt(0),
    );
    // WebCrypto backends differ on low-order points. Refuse those before verification.
    if (ed25519.Point.fromBytes(publicKey).isSmallOrder() || ed25519.Point.fromBytes(raw.slice(0, 32)).isSmallOrder())
      throw new Error("Small-order Ed25519 point refused");
    const bytes = new TextEncoder().encode(payload);
    if (!bytes.length || bytes.length > 400_000) throw new Error("Signed payload is empty or too large");
    if (tamper) bytes[0] = bytes[0]! ^ 1;
    if (!globalThis.crypto?.subtle) return { status: "unverifiable", reason: "WebCrypto Ed25519 is unavailable" };
    const key = await crypto.subtle.importKey("raw", publicKey, "Ed25519", false, ["verify"]);
    const valid = await crypto.subtle.verify("Ed25519", key, raw, bytes);
    return {
      status: valid ? "verified" : "invalid",
      reason: valid ? "Ed25519 signature matches these exact bytes" : "Signature mismatch",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "NotSupportedError")
      return { status: "unverifiable", reason: "WebCrypto Ed25519 is unavailable" };
    return { status: "invalid", reason: error instanceof Error ? error.message : "Invalid signature input" };
  }
}

/** Check the server's canonical message form. Example: await verifyMessage({did, room, nonce, text, signature}). */
export async function verifyMessage(input: {
  did: string;
  room: string;
  nonce: string;
  text: string;
  signature?: string;
}): Promise<Verdict> {
  try {
    return await verifySignature(input.did, messagePayload(input.room, input.nonce, input.text), input.signature);
  } catch (error) {
    return { status: "invalid", reason: error instanceof Error ? error.message : "Invalid message" };
  }
}

/** Check a signed note envelope. Example: await verifyNote({did, ns, key, nonce, value, signature}). */
export async function verifyNote(input: {
  did: string;
  ns: string;
  key: string;
  nonce: string;
  value: string;
  signature?: string;
}): Promise<Verdict> {
  try {
    return await verifySignature(
      input.did,
      notePayload(input.ns, input.key, input.nonce, input.value),
      input.signature,
    );
  } catch (error) {
    return { status: "invalid", reason: error instanceof Error ? error.message : "Invalid note" };
  }
}
