// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseBuild, parseManifest, verifyBuild } from "./manifest";

/** Verify a build against every tracked checkout file. Example: await verifyFile('SIGNATURE.json', '.'). */
export async function verifyFile(signaturePath: string, directory: string, expectedDid?: string) {
  const root = await realpath(directory);
  if ((await lstat(signaturePath)).size > 200_000) throw new Error("Signature file exceeds 200 KB");
  const input: unknown = JSON.parse(await readFile(signaturePath, "utf8"));
  const build = parseBuild(input),
    verdict = await verifyBuild(input);
  if (verdict.status !== "verified") throw new Error(verdict.reason);
  if (expectedDid && build.did !== expectedDid) throw new Error("Unexpected signer DID");
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const commit = git("rev-parse", "HEAD").trim();
  if (commit !== build.commit) throw new Error("Signed commit differs from checkout HEAD");
  const rows = git("ls-tree", "-rz", "--full-tree", "HEAD")
    .split("\0")
    .filter(Boolean)
    .map((row) => {
      const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(row);
      if (!match || match[2] !== "blob" || !["100644", "100755", "120000"].includes(match[1]!))
        throw new Error("Unsupported git tree entry");
      return { mode: match[1]!, path: match[4]! };
    })
    .filter((row) => row.path !== "SIGNATURE.json")
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const manifest = parseManifest(build.manifest);
  if (rows.length !== manifest.files.length || rows.some((row, i) => row.path !== manifest.files[i]?.path))
    throw new Error("Manifest does not cover exactly the tracked files");
  for (const [i, row] of rows.entries()) {
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
    if (createHash("sha256").update(bytes).digest("hex") !== manifest.files[i]?.hash)
      throw new Error(`File hash mismatch: ${row.path}`);
  }
  return {
    status: "verified" as const,
    reason: "Manifest and all tracked file bytes match",
    did: build.did,
    commit,
    files: rows.length,
    source: root,
    measuredAt: new Date().toISOString(),
  };
}
