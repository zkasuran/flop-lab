// SPDX-License-Identifier: Apache-2.0
import { generateKeyPairSync, sign } from "node:crypto";

// Only tests create keys. They are throwaway in-memory keys and are never persisted.
export function signingKey() {
  const pair = generateKeyPairSync("ed25519");
  const raw = new Uint8Array(pair.publicKey.export({ type: "spki", format: "der" }).subarray(-32));
  const prefixed = new Uint8Array([0xed, 0x01, ...raw]);
  let value = BigInt(`0x${Buffer.from(prefixed).toString("hex")}`);
  let encoded = "";
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  while (value) {
    encoded = alphabet[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  return {
    did: `did:key:z${encoded}`,
    raw,
    sign: (text: string) => sign(null, Buffer.from(text), pair.privateKey).toString("base64url"),
  };
}
