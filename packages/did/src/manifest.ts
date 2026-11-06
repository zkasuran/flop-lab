// SPDX-License-Identifier: Apache-2.0
import { decodeDidKey, fingerprint, verifySignature, type Verdict } from "./crypto";
export type Manifest = { commit: string; branch: string | null; files: { path: string; hash: string }[] };
export type Build = { did: string; fingerprint: string; commit: string; manifest: string; signature: string };

/** Validate a network JSON object. Example: object(JSON.parse(raw)). */
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}

/** Validate a bounded string without coercion. Example: text(row.did). */
export function text(value: unknown, max = 200_000): string {
  if (typeof value !== "string" || value.length > max) throw new Error("Expected a bounded string");
  return value;
}

/** Parse canonical signed manifest rows. Example: parseManifest(build.manifest). */
export function parseManifest(value: string): Manifest {
  if (value.length > 400_000 || value.includes("\r") || value.endsWith("\n"))
    throw new Error("Manifest must use LF with no final LF");
  const [header = "", ...rows] = value.split("\n");
  const match = /^flop-lab ([a-f0-9]{40})(?: ([a-zA-Z0-9][a-zA-Z0-9/_.-]*))?$/.exec(header);
  if (!match?.[1] || !rows.length) throw new Error("Invalid manifest header or empty file list");
  const files = rows.map((row) => {
    const m = /^([a-f0-9]{64}) {2}(.+)$/.exec(row);
    if (!m?.[1] || !m[2]) throw new Error("Invalid manifest row");
    const path = m[2];
    if (
      path === "SIGNATURE.json" ||
      /[\\\p{C}]/u.test(path) ||
      path.split("/").some((p) => ["", ".", ".."].includes(p)) ||
      /^[A-Za-z]:/.test(path)
    )
      throw new Error("Unsafe manifest path");
    return { hash: m[1], path };
  });
  if (files.some((file, i) => i > 0 && files[i - 1]!.path >= file.path))
    throw new Error("Manifest paths must be unique and sorted");
  return { commit: match[1], branch: match[2] ?? null, files };
}

/** Parse a flop-lab build envelope. Example: parseBuild(JSON.parse(raw)). */
export function parseBuild(input: unknown): Build {
  const row = object(input);
  if (row.schema !== "flop-lab-signature/1" || row.repo !== "zkasuran/flop-lab")
    throw new Error("Unsupported build schema or repository");
  const build = {
    did: text(row.did, 56),
    fingerprint: text(row.fingerprint, 16),
    commit: text(row.commit, 40),
    manifest: text(row.manifest, 400_000),
    signature: text(row.signature, 86),
  };
  decodeDidKey(build.did);
  const manifest = parseManifest(build.manifest);
  if (manifest.commit !== build.commit || manifest.branch !== null)
    throw new Error("Build commit differs from signed manifest");
  return build;
}

/** Verify signed manifest and fingerprint binding. Example: await verifyBuild(json). */
export async function verifyBuild(input: unknown): Promise<Verdict> {
  try {
    const build = parseBuild(input);
    if ((await fingerprint(build.did)) !== build.fingerprint) throw new Error("Build fingerprint differs from DID");
    return await verifySignature(build.did, build.manifest, build.signature);
  } catch (error) {
    return { status: "invalid", reason: error instanceof Error ? error.message : "Invalid build" };
  }
}

/** Extract the publisher's exact proof block. Example: extractProof(issue.body). */
export function extractProof(body: string): { did: string; payload: string; signature: string } {
  const marker = "<details><summary>DID contribution proof</summary>";
  const start = body.indexOf(marker);
  if (start < 0) throw new Error("No supported DID contribution proof block");
  if (body.indexOf(marker, start + marker.length) >= 0) throw new Error("Multiple proof blocks are ambiguous");
  const end = body.indexOf("</details>", start);
  if (end < 0) throw new Error("Incomplete proof block");
  const block = body.slice(start + marker.length, end);
  const dids = [...block.matchAll(/DID: `(did:key:z[1-9A-HJ-NP-Za-km-z]+)`\./g)];
  const manifests = [...block.matchAll(/```text\n([\s\S]*?)\n```/g)];
  const signatures = [...block.matchAll(/Signature: `([A-Za-z0-9_-]+)`/g)];
  if (dids.length !== 1 || manifests.length !== 1 || signatures.length !== 1)
    throw new Error("Malformed or ambiguous proof block");
  const did = dids[0]![1]!,
    payload = manifests[0]![1]!,
    signature = signatures[0]![1]!;
  decodeDidKey(did);
  parseManifest(payload);
  return { did, payload, signature };
}
