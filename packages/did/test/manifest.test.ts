// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fingerprint } from "../src/crypto.js";
import { extractProof, parseManifest, verifyBuild } from "../src/manifest.js";
import { verifyFile } from "../src/file.js";

const key = generateKeyPairSync("ed25519");
const raw = key.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
let n = BigInt(`0xed01${raw.toString("hex")}`),
  encoded = "";
while (n) {
  encoded = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Number(n % 58n)] + encoded;
  n /= 58n;
}
const did = `did:key:z${encoded}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function envelope(manifest: string) {
  return {
    schema: "flop-lab-signature/1",
    repo: "zkasuran/flop-lab",
    did,
    fingerprint: await fingerprint(did),
    commit: manifest.split(" ")[1]!.split("\n")[0]!,
    manifest,
    signature: sign(null, Buffer.from(manifest), key.privateKey).toString("base64url"),
  };
}
const header = `flop-lab ${"a".repeat(40)}`;

it.each(["../escape", "/absolute", "a/../b", "a\\b", "C:/file", "SIGNATURE.json", "a//b", "a/./b"])(
  "rejects unsafe manifest path %s",
  (path) => expect(() => parseManifest(`${header}\n${hash("x")}  ${path}`)).toThrow(),
);
it("refuses duplicate, reordered and noncanonical manifest lines", () => {
  for (const rows of [
    `${hash("x")}  a\n${hash("x")}  a`,
    `${hash("x")}  b\n${hash("x")}  a`,
    `${hash("x")}  a\n`,
    `${hash("x")}  a\r`,
  ])
    expect(() => parseManifest(`${header}\n${rows}`)).toThrow();
  expect(() => extractProof("nothing")).toThrow("No supported");
});
it("binds build commit and DID fingerprint", async () => {
  const build = await envelope(`${header}\n${hash("x")}  a`);
  expect((await verifyBuild(build)).status).toBe("verified");
  for (const change of [
    { commit: "b".repeat(40) },
    { fingerprint: "0".repeat(16) },
    { signature: "" },
    { manifest: build.manifest + "\n" },
  ])
    expect((await verifyBuild({ ...build, ...change })).status).toBe("invalid");
});
it("verifies every tracked byte and rejects tampering, omissions and symlink substitution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "did-files-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Fixture",
        GIT_AUTHOR_EMAIL: "fixture@example.test",
        GIT_COMMITTER_NAME: "Fixture",
        GIT_COMMITTER_EMAIL: "fixture@example.test",
      },
    }).trim();
  try {
    git("init", "-q");
    await writeFile(join(dir, "a.txt"), "a");
    await writeFile(join(dir, "b.txt"), "b");
    git("add", "a.txt", "b.txt");
    git("commit", "-qm", "test(did): fixture");
    const commit = git("rev-parse", "HEAD");
    const manifest = `flop-lab ${commit}\n${hash("a")}  a.txt\n${hash("b")}  b.txt`;
    const file = join(dir, "SIGNATURE.json");
    await writeFile(file, JSON.stringify(await envelope(manifest)));
    expect(await verifyFile(file, dir, did)).toMatchObject({ status: "verified", files: 2 });
    await expect(verifyFile(file, dir, "wrong")).rejects.toThrow("signer");
    await writeFile(join(dir, "a.txt"), "tampered");
    await expect(verifyFile(file, dir)).rejects.toThrow("hash mismatch");
    await rm(join(dir, "a.txt"));
    await symlink("b.txt", join(dir, "a.txt"));
    await expect(verifyFile(file, dir)).rejects.toThrow("type mismatch");
    await writeFile(file, JSON.stringify(await envelope(`flop-lab ${commit}\n${hash("a")}  a.txt`)));
    await expect(verifyFile(file, dir)).rejects.toThrow("exactly the tracked files");
  } finally {
    await rm(dir, { recursive: true });
  }
});
it("verifies a build above the former 200000 character bound and still refuses one above 400000", async () => {
  const rows = (count: number) =>
    Array.from({ length: count }, (_, i) => `${hash("x")}  f/${String(i).padStart(6, "0")}.txt`).join("\n");
  const big = `${header}\n${rows(3000)}`;
  expect(big.length).toBeGreaterThan(200_000);
  expect(big.length).toBeLessThanOrEqual(400_000);
  expect(parseManifest(big).files).toHaveLength(3000);
  expect((await verifyBuild(await envelope(big))).status).toBe("verified");
  const huge = `${header}\n${rows(6000)}`;
  expect(huge.length).toBeGreaterThan(400_000);
  const verdict = await verifyBuild(await envelope(huge));
  expect(verdict.status).toBe("invalid");
});
