// SPDX-License-Identifier: Apache-2.0
/** Normalize a SHA-256 hash lock without accepting preimage input.
 * @example normalizeHashLock("00".repeat(32));
 */
export function normalizeHashLock(value: string): string {
  if (typeof value !== "string" || !/^(0x)?[a-fA-F0-9]{64}$/.test(value))
    throw new Error("Hash lock must contain exactly 32 bytes of hexadecimal");
  return value.replace(/^0x/, "").toLowerCase();
}
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Generate a local 32-byte preimage and SHA-256 digest using Web Crypto. Performs no network calls.
 * @example const { hashLock, preimage } = await generateHashLock();
 */
export async function generateHashLock() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return {
    preimage: hex(bytes),
    hashLock: hex(new Uint8Array(digest)),
    algorithm: "SHA-256",
    generatedAt: new Date().toISOString(),
    source: "local Web Crypto",
  };
}
