// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { verifyCheckout } from "../../../scripts/verify-signature.mjs";
import { FINGERPRINT } from "../lib/constants";
import { signingKey } from "./signing";

it("checks every tracked file offline and detects edits, omissions and a wrong checkout", async () => {
  const base = join(tmpdir(), "opencode");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "flop-checkout-"));
  const key = signingKey();
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Fixture",
        GIT_AUTHOR_EMAIL: "fixture@example.invalid",
        GIT_COMMITTER_NAME: "Fixture",
        GIT_COMMITTER_EMAIL: "fixture@example.invalid",
      },
    });
  try {
    git("init", "-q");
    await writeFile(join(root, "README.md"), "fixture\n");
    await writeFile(join(root, "file with spaces.txt"), "bytes");
    git("add", "README.md", "file with spaces.txt");
    git("commit", "-qm", "test: fixture");
    const commit = git("rev-parse", "HEAD").trim();
    const rows = await Promise.all(
      ["README.md", "file with spaces.txt"].map(
        async (path) =>
          `${createHash("sha256")
            .update(await readFile(join(root, path)))
            .digest("hex")}  ${path}`,
      ),
    );
    const manifest = `flop-lab ${commit}\n${rows.join("\n")}`;
    const envelope = {
      schema: "flop-lab-signature/1",
      did: key.did,
      fingerprint: FINGERPRINT,
      repo: "zkasuran/flop-lab",
      commit,
      signedAt: new Date().toISOString(),
      manifest,
      signature: key.sign(manifest),
      attestation: { room: "technocore", seq: 1, url: "https://technocore.chat/r/technocore" },
    };
    const file = join(root, "SIGNATURE.json");
    await writeFile(file, JSON.stringify(envelope));
    expect(await verifyCheckout(file, root, key.did)).toMatchObject({ valid: true, files: 2, commit });
    await expect(verifyCheckout(file, root)).rejects.toThrow("Unexpected signer");
    await writeFile(join(root, "README.md"), "changed");
    await expect(verifyCheckout(file, root, key.did)).rejects.toThrow("File hash mismatch");
    await writeFile(join(root, "README.md"), "fixture\n");
    const omitted = `flop-lab ${commit}\n${rows[0]}`;
    await writeFile(file, JSON.stringify({ ...envelope, manifest: omitted, signature: key.sign(omitted) }));
    await expect(verifyCheckout(file, root, key.did)).rejects.toThrow("exactly the tracked files");
    await writeFile(file, JSON.stringify(envelope));
    await writeFile(join(root, "new.txt"), "extra");
    git("add", "new.txt");
    git("commit", "-qm", "test: extra");
    await expect(verifyCheckout(file, root, key.did)).rejects.toThrow("checkout HEAD");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
