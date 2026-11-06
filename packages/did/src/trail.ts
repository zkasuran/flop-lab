// SPDX-License-Identifier: Apache-2.0
import { decodeDidKey, fingerprint, messagePayload, name, verifySignature, type Verdict } from "./crypto";
import { extractProof, object, parseBuild, text, verifyBuild } from "./manifest";

export type Observation = { source: string; measuredAt: string; status: number; raw: string };
export type Reader = (url: string) => Promise<Observation>;
export type Artifact = {
  id: string;
  kind: "note" | "message" | "github" | "build";
  title: string;
  source: string;
  measuredAt: string;
  claimedAt?: string;
  did?: string;
  content: string;
  payload?: string;
  signature?: string;
  problem?: Verdict;
};
export type Trail = {
  query: string;
  fingerprint: string;
  did: string | null;
  artifacts: Artifact[];
  observations: Omit<Observation, "raw">[];
  gaps: string[];
  searchedAt: string;
};
export const DEFAULT_DID = "did:key:z6MkoA8xuzKJRGtHa5hr6znFCZq164mb45JHx6kktdJ6tMdL";

/** Preserve numeric nonce tokens with JSON.parse source context. Example: parseJson(raw). */
export function parseJson(raw: string): unknown {
  return JSON.parse(raw, (key: string, value: unknown, context?: { source: string }) => {
    if (key === "nonce" && typeof value === "number") {
      if (context?.source && /^[0-9]{1,19}$/.test(context.source)) return context.source;
      throw new Error("Exact nonce digits unavailable; use Node 22 or a current browser");
    }
    return value;
  });
}

/** Validate a recorded response envelope. Example: parseObservation(JSON.parse(file)). */
export function parseObservation(input: unknown): Observation {
  const row = object(input);
  const source = text(row.source, 2000),
    measuredAt = text(row.measuredAt, 40),
    raw = text(row.raw, 200_000);
  if (
    !Number.isFinite(Date.parse(measuredAt)) ||
    typeof row.status !== "number" ||
    !Number.isInteger(row.status) ||
    row.status < 100 ||
    row.status > 599
  )
    throw new Error("Invalid observation metadata");
  const url = new URL(source);
  if (
    url.protocol !== "https:" ||
    !["technocore.chat", "api.github.com", "raw.githubusercontent.com"].includes(url.hostname)
  )
    throw new Error("Unrecognized source origin");
  return { source, measuredAt, raw, status: row.status };
}

/** Parse retained room records, keeping malformed matching rows visible. Example: roomArtifacts(observation). */
export function roomArtifacts(obs: Observation): Artifact[] {
  const page = object(parseJson(obs.raw));
  const room = name(text(page.room, 48));
  if (new URL(obs.source).pathname !== `/r/${room}`) throw new Error("Room name differs from requested source");
  if (!Array.isArray(page.messages) || page.messages.length > 200 || page.count !== page.messages.length)
    throw new Error("Invalid room page count");
  return page.messages.map((input: unknown, index) => {
    const row = object(input),
      did = text(row.from, 100),
      content = text(row.text, 20_000);
    const artifact: Artifact = {
      id: `${obs.source}#${index}`,
      kind: "message",
      title: `/${room} message ${String(row.seq)}`,
      source: obs.source,
      measuredAt: obs.measuredAt,
      content,
      did,
    };
    if (typeof row.ts === "string" && Number.isFinite(Date.parse(row.ts))) artifact.claimedAt = row.ts;
    try {
      if (!Number.isSafeInteger(row.seq) || Number(row.seq) < 1) throw new Error("Invalid message sequence");
      if (row.sig === undefined)
        artifact.problem = { status: "unverifiable", reason: "No signature retained by the source" };
      else {
        artifact.signature = text(row.sig, 1000);
        artifact.payload = messagePayload(room, text(row.nonce, 19), content);
      }
    } catch (error) {
      artifact.problem = { status: "invalid", reason: String(error) };
    }
    return artifact;
  });
}

/** Verify one trail artifact in Node or a browser. Example: await verifyArtifact(row, true). */
export async function verifyArtifact(artifact: Artifact, tamper = false): Promise<Verdict> {
  if (artifact.problem) return artifact.problem;
  if (!artifact.did || artifact.payload === undefined)
    return { status: "unverifiable", reason: "No supported signed envelope" };
  return verifySignature(artifact.did, artifact.payload, artifact.signature, tamper);
}

/** Build a bounded trail from public reads or recorded responses. Example: await collectTrail(did, reader). */
export async function collectTrail(
  query: string,
  read: Reader,
  options: { room?: string; repo?: string } = {},
): Promise<Trail> {
  let did: string | null = null;
  if (query.startsWith("did:")) {
    decodeDidKey(query);
    did = query;
  } else if (!/^[0-9a-f]{16}$/.test(query)) throw new Error("Enter an Ed25519 did:key or 16 lowercase hex fingerprint");
  const fp = did ? await fingerprint(did) : query;
  const room = name(options.room ?? "technocore"),
    repo = options.repo ?? "zkasuran/flop-lab";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || repo.split("/").some((p) => p === "." || p === ".."))
    throw new Error("Invalid GitHub repository");
  const trail: Trail = {
    query,
    fingerprint: fp,
    did,
    artifacts: [],
    observations: [],
    gaps: [],
    searchedAt: new Date().toISOString(),
  };
  const get = async (url: string): Promise<Observation | null> => {
    try {
      const obs = parseObservation(await read(url));
      if (obs.source !== url) throw new Error("Response source differs from requested URL");
      const { raw: _raw, ...meta } = obs;
      trail.observations.push(meta);
      if (obs.status !== 200) {
        trail.gaps.push(`HTTP ${obs.status}: ${url}`);
        return null;
      }
      return obs;
    } catch (error) {
      trail.gaps.push(`${url}: ${error instanceof Error ? error.message : "Read failed"}`);
      return null;
    }
  };
  const matches = async (candidate: string): Promise<boolean> => {
    if (did) return candidate === did;
    try {
      return (await fingerprint(candidate)) === fp;
    } catch {
      return false;
    }
  };
  for (const path of [`did-${fp.slice(0, 2)}/${fp.slice(2)}`, `did/${fp}`, `agent/${fp}`]) {
    const obs = await get(`https://technocore.chat/kv/${path}`);
    if (!obs) continue;
    // The service serves one untrusted banner, a blank line then the stored single-line value.
    const body = obs.raw.startsWith("!! UNTRUSTED CONTENT") ? obs.raw.slice(obs.raw.indexOf("\n\n") + 2) : obs.raw;
    const content = body.replace(/\n$/, "");
    const candidates = [...content.matchAll(/did:key:z[1-9A-HJ-NP-Za-km-z]{47}/g)].map((m) => m[0]);
    for (const candidate of candidates) if (await matches(candidate)) did = candidate;
    trail.artifacts.push({
      id: obs.source,
      kind: "note",
      title: `Profile note: ${path}`,
      source: obs.source,
      measuredAt: obs.measuredAt,
      content,
      problem: {
        status: "unverifiable",
        reason: "Profile notes are world-writable; this response has no signed envelope",
      },
    });
  }
  const readRoom = async (url: string) => {
    const obs = await get(url);
    if (!obs) return;
    try {
      for (const artifact of roomArtifacts(obs))
        if (artifact.did && (await matches(artifact.did))) {
          did = artifact.did;
          trail.artifacts.push(artifact);
        }
    } catch (error) {
      trail.gaps.push(`Room parse failed: ${String(error)}`);
    }
  };
  await readRoom(`https://technocore.chat/r/${room}?format=json&limit=100`);
  const search = `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${repo} "${did ?? fp}" in:body`)}&per_page=3&sort=updated&order=desc`;
  const github = await get(search);
  let attestation: number | undefined;
  if (github)
    try {
      const page = object(parseJson(github.raw));
      if (
        !Array.isArray(page.items) ||
        page.items.length > 3 ||
        !Number.isSafeInteger(page.total_count) ||
        Number(page.total_count) < page.items.length ||
        typeof page.incomplete_results !== "boolean"
      )
        throw new Error("Invalid GitHub search page");
      trail.gaps.push(
        `GitHub returned ${page.items.length} of ${page.total_count} matches in ${repo}. Search is bounded and can omit results.`,
      );
      if (page.incomplete_results) trail.gaps.push("GitHub marked the search incomplete");
      for (const input of page.items) {
        const row = object(input),
          body = text(row.body ?? ""),
          source = text(row.html_url, 1000);
        const url = new URL(source);
        if (
          url.origin !== "https://github.com" ||
          ![`/${repo}/issues/${row.number}`, `/${repo}/pull/${row.number}`].includes(url.pathname) ||
          url.search ||
          url.hash
        )
          throw new Error("Unexpected GitHub artifact URL");
        const artifact: Artifact = {
          id: source,
          kind: "github",
          title: text(row.title, 1000),
          source,
          measuredAt: github.measuredAt,
          content:
            "The signature covers the manifest below. The title, issue body and current PR head are not checked.",
        };
        if (typeof row.updated_at === "string") artifact.claimedAt = row.updated_at;
        try {
          const proof = extractProof(body);
          if (!(await matches(proof.did))) continue;
          did = proof.did;
          Object.assign(artifact, proof);
          const seq = /attestation seq `(\d+)`/.exec(body)?.[1];
          if (seq && Number.isSafeInteger(Number(seq)) && Number(seq) > 0)
            attestation = Math.max(attestation ?? 0, Number(seq));
        } catch (error) {
          artifact.problem = {
            status: body.includes("DID contribution proof") ? "invalid" : "unverifiable",
            reason: String(error),
          };
        }
        trail.artifacts.push(artifact);
      }
    } catch (error) {
      trail.gaps.push(`GitHub parse failed: ${String(error)}`);
    }
  if (room === "technocore" && attestation && !trail.artifacts.some((a) => a.kind === "message"))
    await readRoom(`https://technocore.chat/r/${room}?format=json&limit=100&since=${attestation - 1}`);
  if (attestation && !trail.artifacts.some((a) => a.kind === "message"))
    trail.gaps.push(
      "The referenced attestation was not in the returned room slices. The since cursor is a lower bound, not historical pagination.",
    );
  const build = await get("https://raw.githubusercontent.com/zkasuran/flop-lab/main/SIGNATURE.json");
  if (build)
    try {
      const parsed = parseBuild(parseJson(build.raw));
      if (await matches(parsed.did)) {
        const verdict = await verifyBuild(parseJson(build.raw));
        trail.artifacts.push({
          id: build.source,
          kind: "build",
          title: `Build ${parsed.commit.slice(0, 12)}`,
          source: build.source,
          measuredAt: build.measuredAt,
          did: parsed.did,
          content: "Signed manifest only. Use verify-file to check local file bytes.",
          payload: parsed.manifest,
          signature: parsed.signature,
          ...(verdict.status !== "verified" ? { problem: verdict } : {}),
        });
      }
    } catch (error) {
      trail.gaps.push(`Build parse failed: ${String(error)}`);
    }
  trail.did = did;
  trail.gaps.push(
    `Only a bounded slice of /${room} was read. Retention, other rooms and other repositories are outside this trail. Server times and sequence numbers are unsigned.`,
  );
  if (!did)
    trail.gaps.push("No full DID matching this fingerprint was found. A fingerprint alone cannot verify a signature.");
  trail.artifacts.sort((a, b) => b.measuredAt.localeCompare(a.measuredAt) || a.id.localeCompare(b.id));
  return trail;
}
