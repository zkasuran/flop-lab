// SPDX-License-Identifier: Apache-2.0
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decodeDidKey,
  fingerprint,
  messagePayload,
  notePayload,
  sweep,
  verifyMessage,
  verifyNote,
  verifySignature,
} from "../src/crypto.js";
import { parseJson, roomArtifacts, DEFAULT_DID, collectTrail, verifyArtifact } from "../src/trail.js";
import { recordedReader, recordings } from "../src/recorded.js";

export function didFor(bytes: Uint8Array) {
  let n = BigInt(`0x${Buffer.concat([Buffer.from([0xed, 1]), bytes]).toString("hex")}`),
    encoded = "";
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  while (n) {
    encoded = alphabet[Number(n % 58n)] + encoded;
    n /= 58n;
  }
  return `did:key:z${encoded}`;
}
const key = generateKeyPairSync("ed25519");
const publicBytes = key.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
const did = didFor(publicBytes);
const signature = (value: string) => sign(null, Buffer.from(value), key.privateKey).toString("base64url");

describe("canonical protocol bytes", () => {
  it("decodes ed01 and hashes the DID string, not key bytes", async () => {
    expect(decodeDidKey(did)).toEqual(new Uint8Array(publicBytes));
    expect(await fingerprint(DEFAULT_DID)).toBe("f15ddb2552fee06f");
  });
  it.each([
    "",
    "did:web:example.com",
    did + "#key",
    did.replace("z6", "z16"),
    did.replace("did:key:", "XXXXXXXX"),
    "did:key:z" + "1".repeat(47),
  ])("rejects malformed DID %s", (value) => expect(() => decodeDidKey(value)).toThrow());
  it("applies all six sweep classes without collapsing spaces or NFC", () => {
    expect(sweep("\t A\nB\u200dC\ud800D\ue000E\u2028F\u2029G\u{f0000}H \t")).toBe("A B C D E F G H");
    expect(sweep(" a  b ")).toBe("a  b");
    expect(sweep("e\u0301")).not.toBe(sweep("é"));
    expect(messagePayload("lobby", "001", "a\nb")).toBe("lobby|001|a b");
    expect(notePayload("room-owners", "d-test", "1", "a\nb")).toBe("room-owners|d-test|1|a b");
  });
  it("verifies swept messages and notes and refuses changed context", async () => {
    const payload = "lobby|123|a b";
    const input = { did, room: "lobby", nonce: "123", text: "a\nb", signature: signature(payload) };
    expect((await verifyMessage(input)).status).toBe("verified");
    for (const change of [{ room: "other" }, { nonce: "124" }, { text: "a c" }, { did: DEFAULT_DID }])
      expect((await verifyMessage({ ...input, ...change })).status).toBe("invalid");
    expect((await verifySignature(did, payload, input.signature, true)).status).toBe("invalid");
    const note = {
      did,
      ns: "room-owners",
      key: "d-test",
      nonce: "1",
      value: "a\nb",
      signature: signature("room-owners|d-test|1|a b"),
    };
    expect((await verifyNote(note)).status).toBe("verified");
    expect((await verifyNote({ ...note, key: "d-other" })).status).toBe("invalid");
  });
  it("distinguishes absent signatures from invalid encodings", async () => {
    expect((await verifySignature(did, "hello")).status).toBe("unverifiable");
    const good = signature("hello");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const alias = good.slice(0, -1) + alphabet[alphabet.indexOf(good.at(-1)!) + 1];
    expect(Buffer.from(alias, "base64url")).toEqual(Buffer.from(good, "base64url"));
    for (const bad of [alias, good + "==", "", "a".repeat(86)])
      expect((await verifySignature(did, "hello", bad)).status).toBe("invalid");
  });
  it("ports upstream small-order and S+L probes and refuses trivial forgeries", async () => {
    // technocore-chat cd41f86, tests/unit/test_didkey_backends.py.
    const seed = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
    const privateKey = createPrivateKey({
      key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
      format: "der",
      type: "pkcs8",
    });
    const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "der" }).subarray(-32);
    const message = "r|standup|status";
    const sig = sign(null, Buffer.from(message), privateKey);
    expect((await verifySignature(didFor(publicKey), message, sig.toString("base64url"))).status).toBe("verified");
    const order = 2n ** 252n + 27742317777372353535851937790883648493n;
    const scalar = BigInt(`0x${Buffer.from(sig.subarray(32)).reverse().toString("hex")}`) + order;
    const mutated = Buffer.concat([
      sig.subarray(0, 32),
      Buffer.from(scalar.toString(16).padStart(64, "0"), "hex").reverse(),
    ]);
    expect((await verifySignature(didFor(publicKey), message, mutated.toString("base64url"))).status).toBe("invalid");
    const small = [
      "00".repeat(32),
      "01" + "00".repeat(31),
      "ec" + "ff".repeat(31),
      "e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800",
      "5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157",
    ];
    for (const publicHex of small)
      expect(
        (await verifySignature(didFor(Buffer.from(publicHex, "hex")), message, sig.toString("base64url"))).status,
      ).toBe("invalid");
    const forged = Buffer.alloc(64);
    forged[0] = 1;
    expect(
      (await verifySignature(didFor(Buffer.from(small[1]!, "hex")), message, forged.toString("base64url"))).status,
    ).toBe("invalid");
  });
  it("preserves a 19-digit numeric nonce and refuses unsafe coercion", async () => {
    const raw = `{"room":"lobby","count":1,"messages":[{"seq":1,"from":"${did}","text":"hello","nonce":9999999999999999999,"sig":"${signature("lobby|9999999999999999999|hello")}"}]}`;
    expect((parseJson(raw) as { messages: { nonce: string }[] }).messages[0]!.nonce).toBe("9999999999999999999");
    const rows = roomArtifacts({
      source: "https://technocore.chat/r/lobby?format=json&limit=100",
      measuredAt: "2026-11-06T00:00:00Z",
      status: 200,
      raw,
    });
    expect((await verifyArtifact(rows[0]!)).status).toBe("verified");
    expect(() => parseJson('{"nonce":1e19}')).toThrow();
  });
});

describe("recorded real evidence", () => {
  it("re-verifies every retained signature from the recorded room pages", async () => {
    for (const obs of recordings.filter((o) => o.source.includes("/r/"))) {
      const rows = roomArtifacts(obs);
      expect(rows.length).toBe(100);
      for (const row of rows.filter((r) => r.signature))
        expect(await verifyArtifact(row)).toMatchObject({ status: "verified" });
    }
  });
  it("resolves the fingerprint and verifies the real GitHub manifests", async () => {
    const trail = await collectTrail("f15ddb2552fee06f", recordedReader);
    expect(trail.did).toBe(DEFAULT_DID);
    const proofs = trail.artifacts.filter((a) => a.kind === "github");
    expect(proofs).toHaveLength(3);
    for (const proof of proofs) {
      expect((await verifyArtifact(proof)).status).toBe("verified");
      expect((await verifyArtifact(proof, true)).status).toBe("invalid");
    }
    expect(trail.artifacts.some((a) => a.kind === "message")).toBe(false);
    expect(trail.gaps.join(" ")).toContain("attestation was not in");
    expect((await verifyArtifact(trail.artifacts.find((a) => a.kind === "note")!)).status).toBe("unverifiable");
    expect(trail.gaps.join(" ")).toContain("49 matches");
    expect(trail.gaps.join(" ")).toContain("HTTP 404");
  });
  it("reports no data and errors without fabricating artifacts", async () => {
    const missing = await collectTrail(DEFAULT_DID, async (url) => ({
      source: url,
      measuredAt: new Date().toISOString(),
      status: 404,
      raw: "missing",
    }));
    expect(missing.artifacts).toEqual([]);
    const offline = await collectTrail(DEFAULT_DID, async () => {
      throw new Error("offline");
    });
    expect(offline.artifacts).toEqual([]);
    expect(offline.gaps.join(" ")).toContain("offline");
    await expect(collectTrail("../../wrong", recordedReader)).rejects.toThrow();
  });
});
