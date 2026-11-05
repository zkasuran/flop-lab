// SPDX-License-Identifier: Apache-2.0
import { CONTRIBUTOR_DID, FINGERPRINT } from "./constants";
import { parseManifest, parseSignedBuild, verifyDidSignature, type Verification } from "./did";

export type ContributionProof = { did: string; manifest: string; signature: string; seq: number };
export type PullRequest = {
  number: number;
  title: string;
  body: string;
  html_url: string;
  state: string;
  head: { sha: string; ref: string };
};

/** Extract the publisher's exact proof block without whitespace normalisation. Example: extractProof(pr.body). */
export function extractProof(body: string): ContributionProof {
  const marker = "<details><summary>DID contribution proof</summary>";
  const start = body.indexOf(marker);
  if (start < 0) throw new Error("No DID contribution proof in this pull request.");
  if (body.indexOf(marker, start + marker.length) >= 0) throw new Error("Multiple proof blocks are ambiguous.");
  const end = body.indexOf("</details>", start);
  if (end < 0) throw new Error("Incomplete proof block.");
  const block = body.slice(start + marker.length, end);
  const did = /DID: `(did:key:z[1-9A-HJ-NP-Za-km-z]+)`\./.exec(block)?.[1];
  const manifests = [...block.matchAll(/```text\n([\s\S]*?)\n```/g)];
  const signatures = [...block.matchAll(/Signature: `([A-Za-z0-9_-]+)`/g)];
  const manifest = manifests[0]?.[1];
  const signature = signatures[0]?.[1];
  const seq = /attestation seq `(\d+)`/.exec(block)?.[1];
  if (
    !did ||
    !manifest ||
    !signature ||
    manifests.length !== 1 ||
    signatures.length !== 1 ||
    !seq ||
    !Number.isSafeInteger(Number(seq)) ||
    Number(seq) < 1
  )
    throw new Error("Malformed contribution proof.");
  parseManifest(manifest);
  return { did, manifest, signature, seq: Number(seq) };
}

/** Verify a PR proof against the pinned signer and current PR head. Example: await verifyContribution(pr). */
export async function verifyContribution(pr: PullRequest, tamper = false): Promise<Verification> {
  try {
    const proof = extractProof(pr.body);
    if (proof.did !== CONTRIBUTOR_DID) throw new Error("Unexpected signer DID.");
    const manifest = parseManifest(proof.manifest);
    if (manifest.commit !== pr.head.sha || manifest.branch !== pr.head.ref)
      throw new Error("Signed commit or branch differs from the current pull request head.");
    return await verifyDidSignature(proof.did, proof.manifest, proof.signature, tamper);
  } catch (cause) {
    return { valid: false, reason: cause instanceof Error ? cause.message : "Invalid contribution proof" };
  }
}

/** Verify a build against the pinned signer and deployed commit. Example: await verifyBuild(json, commit). */
export async function verifyBuild(input: unknown, commit: string, tamper = false): Promise<Verification> {
  try {
    const signed = parseSignedBuild(input);
    if (signed.did !== CONTRIBUTOR_DID || signed.fingerprint !== FINGERPRINT)
      throw new Error("Unexpected build signer or fingerprint.");
    if (signed.commit !== commit) throw new Error("Signed commit does not match this deployed build.");
    return await verifyDidSignature(signed.did, signed.manifest, signed.signature, tamper);
  } catch (cause) {
    return { valid: false, reason: cause instanceof Error ? cause.message : "Invalid build proof" };
  }
}

/** Validate GitHub's public PR response, including link destinations. Example: parsePullRequests(json). */
export function parsePullRequests(input: unknown): PullRequest[] {
  if (!Array.isArray(input) || input.length > 30) throw new Error("Invalid GitHub pull request page");
  return input.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid pull request");
    const pr = item as Record<string, unknown>;
    const head = pr.head as Record<string, unknown> | null;
    if (
      typeof pr.number !== "number" ||
      !Number.isSafeInteger(pr.number) ||
      pr.number < 1 ||
      typeof pr.title !== "string" ||
      pr.title.length > 1000 ||
      (pr.body !== null && typeof pr.body !== "string") ||
      (typeof pr.body === "string" && pr.body.length > 200000) ||
      pr.html_url !== `https://github.com/zkasuran/flop-lab/pull/${pr.number}` ||
      !["open", "closed"].includes(String(pr.state)) ||
      !head ||
      typeof head.sha !== "string" ||
      !/^[a-f0-9]{40}$/.test(head.sha) ||
      typeof head.ref !== "string"
    )
      throw new Error("Malformed GitHub pull request fields");
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body ?? "",
      html_url: pr.html_url,
      state: String(pr.state),
      head: { sha: head.sha, ref: head.ref },
    } as PullRequest;
  });
}
