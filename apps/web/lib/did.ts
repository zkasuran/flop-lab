// SPDX-License-Identifier: Apache-2.0
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export type Verification = { valid: boolean; reason: string };
export type Manifest = { commit: string; branch: string | null; files: { hash: string; path: string }[] };
export type SignedBuild = {
  schema: "flop-lab-signature/1";
  did: string;
  fingerprint: string;
  repo: string;
  commit: string;
  signedAt: string;
  manifest: string;
  signature: string;
  attestation: { room: string; seq: number; url: string };
};

/** Decode an Ed25519 did:key, including its multicodec prefix. Example: decodeDidKey('did:key:z6Mk...'). */
export function decodeDidKey(did: string): Uint8Array<ArrayBuffer> {
  if (!/^did:key:z[1-9A-HJ-NP-Za-km-z]{46,48}$/.test(did)) throw new Error("Expected a base58btc did:key");
  const encoded = did.slice(9);
  let value = 0n;
  for (const char of encoded) value = value * 58n + BigInt(alphabet.indexOf(char));
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 255n));
    value >>= 8n;
  }
  for (const char of encoded) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  if (bytes.length !== 34 || bytes[0] !== 0xed || bytes[1] !== 0x01)
    throw new Error("DID is not an Ed25519 public key");
  return new Uint8Array(bytes.slice(2));
}

/** Verify exact UTF-8 manifest bytes. Tamper flips one byte for a negative control. Example: await verifyDidSignature(did, manifest, signature). */
export async function verifyDidSignature(
  did: string,
  manifest: string,
  signature: string,
  tamper = false,
): Promise<Verification> {
  try {
    const keyBytes = decodeDidKey(did);
    if (!/^[A-Za-z0-9_-]{86}$/.test(signature)) throw new Error("Signature must be unpadded base64url Ed25519");
    const raw = atob(signature.replaceAll("-", "+").replaceAll("_", "/") + "==");
    if (btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "") !== signature)
      throw new Error("Signature encoding is not canonical");
    const bytes = new TextEncoder().encode(manifest);
    if (bytes.length === 0 || bytes.length > 400_000) throw new Error("Manifest is empty or too large");
    if (tamper) bytes[0] = (bytes[0] ?? 0) ^ 1;
    if (!globalThis.crypto?.subtle)
      throw new Error("WebCrypto unavailable. Use HTTPS and a browser with Ed25519 support.");
    const key = await crypto.subtle.importKey("raw", keyBytes, "Ed25519", false, ["verify"]);
    const signatureBytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    const valid = await crypto.subtle.verify("Ed25519", key, signatureBytes, bytes);
    return {
      valid,
      reason: valid
        ? "Manifest signature valid. File contents are not checked in the browser."
        : tamper
          ? "Signature mismatch after flipping one manifest byte."
          : "Signature mismatch. Manifest bytes or signature changed.",
    };
  } catch (cause) {
    return { valid: false, reason: cause instanceof Error ? cause.message : "Signature verification failed" };
  }
}

/** Validate canonical manifest rows without changing signed bytes. Example: parseManifest(manifest). */
export function parseManifest(text: string): Manifest {
  if (text.length > 400_000 || text.endsWith("\n") || text.includes("\r"))
    throw new Error("Manifest must use LF with no final LF");
  const [header = "", ...rows] = text.split("\n");
  const match = /^flop-lab ([a-f0-9]{40})(?: ([a-zA-Z0-9][a-zA-Z0-9/_.-]*))?$/.exec(header);
  if (!match?.[1] || rows.length === 0) throw new Error("Invalid manifest header or empty file list");
  const files = rows.map((row) => {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(row);
    if (!match?.[1] || !match[2]) throw new Error("Invalid manifest row");
    const path = match[2];
    if (
      path.startsWith("/") ||
      path.split("/").some((part) => [".", "..", ""].includes(part)) ||
      [...path].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "\\") ||
      path === "SIGNATURE.json"
    )
      throw new Error("Unsafe manifest path");
    return { hash: match[1], path };
  });
  const paths = files.map((file) => file.path);
  if (new Set(paths).size !== paths.length || paths.some((path, i) => i > 0 && (paths[i - 1] ?? "") >= path))
    throw new Error("Manifest paths must be unique and sorted");
  return { commit: match[1], branch: match[2] ?? null, files };
}

/** Validate the signed-build envelope and bind its commit to the signed header. Example: parseSignedBuild(JSON.parse(raw)). */
export function parseSignedBuild(input: unknown): SignedBuild {
  if (!input || typeof input !== "object") throw new Error("Invalid signed build");
  const data = input as Record<string, unknown>;
  if (
    data.schema !== "flop-lab-signature/1" ||
    typeof data.did !== "string" ||
    typeof data.manifest !== "string" ||
    typeof data.signature !== "string" ||
    typeof data.commit !== "string" ||
    typeof data.signedAt !== "string" ||
    !Number.isFinite(Date.parse(data.signedAt)) ||
    typeof data.fingerprint !== "string" ||
    data.repo !== "zkasuran/flop-lab"
  )
    throw new Error("Invalid SIGNATURE.json fields");
  const manifest = parseManifest(data.manifest);
  if (manifest.commit !== data.commit || manifest.branch !== null)
    throw new Error("Build commit does not match the signed manifest");
  const attestation = data.attestation as Record<string, unknown> | null;
  if (
    !attestation ||
    attestation.room !== "technocore" ||
    attestation.url !== "https://technocore.chat/r/technocore" ||
    typeof attestation.seq !== "number" ||
    !Number.isSafeInteger(attestation.seq) ||
    attestation.seq < 1
  )
    throw new Error("Invalid attestation metadata");
  return data as SignedBuild;
}
