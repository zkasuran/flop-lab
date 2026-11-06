// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import console from "node:console";
import { CONTRIBUTOR_DID, FINGERPRINT } from "../apps/web/lib/constants.ts";
import { parseManifest, parseSignedBuild, verifyDidSignature } from "../apps/web/lib/did.ts";

/** Verify signed bytes and every tracked checkout file offline. Example: await verifyCheckout('SIGNATURE.json', '.'). */
export async function verifyCheckout(signaturePath, checkoutPath, expectedDid = CONTRIBUTOR_DID) {
  const root = await realpath(checkoutPath);
  const raw = await readFile(signaturePath, "utf8");
  if (raw.length > 400000) throw new Error("Signed build exceeds the size limit");
  const signed = parseSignedBuild(JSON.parse(raw));
  if (signed.did !== expectedDid || signed.fingerprint !== FINGERPRINT)
    throw new Error("Unexpected signer or fingerprint");
  const verified = await verifyDidSignature(signed.did, signed.manifest, signed.signature);
  if (!verified.valid) throw new Error(verified.reason);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const commit = git("rev-parse", "HEAD").trim();
  if (signed.commit !== commit) throw new Error("Signed commit differs from checkout HEAD");
  const rows = git("ls-tree", "-rz", "--full-tree", "HEAD")
    .split("\0")
    .filter(Boolean)
    .map((row) => {
      const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(row);
      if (!match || match[2] !== "blob" || !["100644", "100755", "120000"].includes(match[1]))
        throw new Error("Unsupported git tree entry");
      return { mode: match[1], path: match[4] };
    })
    .filter((row) => row.path !== "SIGNATURE.json")
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const manifest = parseManifest(signed.manifest);
  if (rows.length !== manifest.files.length || rows.some((row, i) => row.path !== manifest.files[i]?.path))
    throw new Error("Manifest does not cover exactly the tracked files");
  for (const [index, row] of rows.entries()) {
    const path = resolve(root, row.path);
    if ((await realpath(dirname(path))) !== dirname(path)) throw new Error(`Symlink parent refused: ${row.path}`);
    const info = await lstat(path);
    const bytes =
      row.mode === "120000" && info.isSymbolicLink()
        ? await readlink(path)
        : info.isFile() && !info.isSymbolicLink() && row.mode !== "120000"
          ? await readFile(path)
          : null;
    if (bytes === null) throw new Error(`File type mismatch: ${row.path}`);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== manifest.files[index]?.hash) throw new Error(`File hash mismatch: ${row.path}`);
  }
  return {
    valid: true,
    commit,
    files: rows.length,
    did: signed.did,
    measuredAt: new Date().toISOString(),
    source: root,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 4)
      throw new Error("Usage: node scripts/verify-signature.mjs [SIGNATURE.json] [checkout]");
    console.log(
      JSON.stringify(await verifyCheckout(process.argv[2] ?? "SIGNATURE.json", process.argv[3] ?? "."), null, 2),
    );
  } catch (cause) {
    console.error(`FAIL: ${cause instanceof Error ? cause.message : String(cause)}`);
    process.exitCode = 1;
  }
}
