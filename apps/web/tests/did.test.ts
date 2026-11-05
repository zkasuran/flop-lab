// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { decodeDidKey, parseManifest, parseSignedBuild, verifyDidSignature } from "../lib/did";
import { CONTRIBUTOR_DID, FINGERPRINT } from "../lib/constants";
import { extractProof, parsePullRequests, verifyBuild, verifyContribution } from "../lib/provenance";
import { signingKey } from "./signing";
import recordedPull from "./fixtures/pull-request.json";

const commit = "a".repeat(40);
const row = `${"b".repeat(64)}  README.md`;
const manifest = `flop-lab ${commit}\n${row}`;
const key = signingKey();
const signature = key.sign(manifest);
const envelope = {
  schema: "flop-lab-signature/1",
  did: key.did,
  fingerprint: FINGERPRINT,
  repo: "zkasuran/flop-lab",
  commit,
  signedAt: "2026-11-05T00:00:00Z",
  manifest,
  signature,
  attestation: { room: "technocore", seq: 1, url: "https://technocore.chat/r/technocore" },
};
const prManifest = `flop-lab ${commit} fl/a00-web/test\n${row}`;
function body(did = key.did) {
  return `<details><summary>DID contribution proof</summary>\n\nContributor: zkasuran. DID: \`${did}\`.\n\n\`\`\`text\n${prManifest}\n\`\`\`\n\nSignature: \`${key.sign(prManifest)}\`\n\nSigned \`/r/technocore\` attestation seq \`1\`.\n</details>`;
}

describe("Ed25519 known-answer checks with in-memory throwaway keys", () => {
  it("decodes exactly the generated public key, after the ed01 prefix", () => {
    expect(decodeDidKey(key.did)).toEqual(key.raw);
    expect(decodeDidKey(CONTRIBUTOR_DID)).toHaveLength(32);
  });
  it("verifies the exact signed manifest and rejects a one-byte tamper", async () => {
    expect((await verifyDidSignature(key.did, manifest, signature)).valid).toBe(true);
    expect((await verifyDidSignature(key.did, manifest, signature, true)).valid).toBe(false);
    expect((await verifyDidSignature(key.did, `${manifest}\n`, signature)).valid).toBe(false);
    expect((await verifyDidSignature(signingKey().did, manifest, signature)).valid).toBe(false);
  });
  it("uses UTF-8 bytes without normalising text", async () => {
    const text = "flop-lab café\n";
    expect((await verifyDidSignature(key.did, text, key.sign(text))).valid).toBe(true);
    expect((await verifyDidSignature(key.did, text.normalize("NFD"), key.sign(text))).valid).toBe(false);
  });
  it.each(["did:web:example.com", `${key.did}#fragment`, key.did.replace("z", "u"), "did:key:z" + "1".repeat(47)])(
    "rejects a non-Ed25519 DID %s",
    (did) => {
      expect(() => decodeDidKey(did)).toThrow();
    },
  );
  it("rejects invalid, padded and noncanonical signatures", async () => {
    for (const sig of ["", `${signature}=`, "x".repeat(86), signature.slice(0, 85) + "B"])
      expect((await verifyDidSignature(key.did, manifest, sig)).valid).toBe(false);
  });
});
describe("manifest and identity policy", () => {
  it("verifies the recorded public publisher proof and rejects tampering or a changed head", async () => {
    const [pr] = parsePullRequests([JSON.parse(recordedPull.raw)]);
    if (!pr) throw new Error("Missing recorded pull request");
    expect(parseManifest(extractProof(pr.body).manifest).branch).toBe("feat-site");
    expect(await verifyContribution(pr)).toMatchObject({ valid: true });
    expect(await verifyContribution(pr, true)).toMatchObject({
      valid: false,
      reason: expect.stringContaining("flipping"),
    });
    expect(await verifyContribution({ ...pr, head: { ...pr.head, sha: "0".repeat(40) } })).toMatchObject({
      valid: false,
    });
  });
  it("extracts the exact publisher block and checks the signed commit", () => {
    expect(extractProof(body())).toMatchObject({ did: key.did, manifest: prManifest, seq: 1 });
    expect(parseManifest(manifest).commit).toBe(commit);
    expect(parseSignedBuild(envelope)).toEqual(envelope);
    expect(() => parseSignedBuild({ ...envelope, commit: "c".repeat(40) })).toThrow("commit");
  });
  it.each([
    `${manifest}\n`,
    manifest.replace("\n", "\r\n"),
    `flop-lab ${commit}\n${row}\n${row}`,
    `flop-lab ${commit}\n${"a".repeat(64)}  ../escape`,
    `flop-lab ${commit}\n${"a".repeat(64)}  SIGNATURE.json`,
  ])("rejects noncanonical or unsafe manifest %s", (value) => {
    expect(() => parseManifest(value)).toThrow();
  });
  it("rejects a missing or ambiguous proof block", () => {
    expect(() => extractProof("No proof")).toThrow("No DID");
    expect(() => extractProof(body() + body())).toThrow("Multiple");
  });
  it("never accepts a valid signature from a different identity", async () => {
    const pr = {
      number: 1,
      title: "Test",
      body: body(),
      state: "open",
      html_url: "https://github.com/zkasuran/flop-lab/pull/1",
      head: { sha: commit, ref: "fl/a00-web/test" },
    };
    expect(await verifyContribution(pr)).toMatchObject({ valid: false, reason: "Unexpected signer DID." });
    expect(await verifyBuild(envelope, commit)).toMatchObject({
      valid: false,
      reason: "Unexpected build signer or fingerprint.",
    });
    expect(
      await verifyContribution({ ...pr, body: body(CONTRIBUTOR_DID), head: { ...pr.head, sha: "d".repeat(40) } }),
    ).toMatchObject({ valid: false, reason: "Signed commit or branch differs from the current pull request head." });
  });
  it("rejects hostile GitHub link destinations and accepts a real empty page", () => {
    expect(parsePullRequests([])).toEqual([]);
    expect(() => parsePullRequests([{ number: 1, html_url: "javascript:alert(1)" }])).toThrow();
  });
});
