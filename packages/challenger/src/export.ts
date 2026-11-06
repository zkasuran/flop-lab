// SPDX-License-Identifier: Apache-2.0
import {
  canonical,
  digest,
  integrityErrors,
  parseEvidence,
  verifyEvidence,
  type Report,
} from "../../verifier/src/index";
import type { Dossier } from "./types";
import { analyzeWindows, type WindowCapture } from "./windows";
import { object } from "./validation";

export const MAX_DOSSIER_BYTES = 2_000_000;

/** Hash canonical UTF-8 JSON excluding the top-level sha256 field. This is integrity, not a signature.
 * @example const dossier = await sealDossier(payload)
 */
export async function sealDossier(payload: Omit<Dossier, "sha256">): Promise<Dossier> {
  return { ...payload, sha256: await digest(canonical(payload)) };
}

/** Re-run attached verifier and block-window checks offline. Reject edits before reading derived claims.
 * @example const replay = await replayDossier(JSON.parse(file))
 */
export async function replayDossier(
  value: unknown,
): Promise<{ sha256: string; verifier: Report; windowMatches: boolean }> {
  const bytes = canonical(value);
  if (new TextEncoder().encode(bytes).length > MAX_DOSSIER_BYTES) throw new Error("Dossier exceeds 2 MB");
  const o = object(value, "dossier");
  if (o.version !== 2 || o.mode !== "DRY RUN ONLY") throw new Error("Unsupported dossier");
  const { sha256, ...payload } = o;
  if (sha256 !== (await digest(canonical(payload)))) throw new Error("Dossier content hash mismatch");
  const v = object(o.verifier, "verifier");
  const bundle = parseEvidence(v.bundle);
  if (bundle.channelId !== o.channelId || (await integrityErrors(bundle)).length)
    throw new Error("Verifier bundle binding or integrity failed");
  const verifier = await verifyEvidence(bundle);
  if (canonical(verifier) !== canonical(v.report))
    throw new Error("Stored verifier result differs from offline replay");
  let windowMatches = o.blockWindow === null;
  if (o.windowCapture !== null) {
    const c = object(o.windowCapture, "windowCapture");
    if (typeof c.capturedAt !== "string" || !Array.isArray(c.observations)) throw new Error("Invalid window capture");
    // Reuse the verifier's strict raw-observation validation and hashes.
    const wrapped = parseEvidence({ ...bundle, capturedAt: c.capturedAt, observations: c.observations });
    for (const observation of wrapped.observations) {
      const { sha256: hash, ...raw } = observation;
      if (hash !== (await digest(canonical(raw)))) throw new Error("Window observation hash mismatch");
    }
    const replay = analyzeWindows(c as unknown as WindowCapture).rows.find((r) => r.channelId === o.channelId) ?? null;
    windowMatches = canonical(replay) === canonical(o.blockWindow);
  }
  if (!windowMatches) throw new Error("Stored window differs from offline replay");
  return { sha256: String(sha256), verifier, windowMatches };
}

function escape(value: string): string {
  return value.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

/** Markdown includes the complete portable JSON in a safely sized fence.
 * @example await writeFile("dossier.md", dossierMarkdown(dossier))
 */
export function dossierMarkdown(dossier: Dossier): string {
  const json = JSON.stringify(dossier, null, 2);
  const fence = "`".repeat(Math.max(3, ...[...json.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  const window = dossier.blockWindow;
  return [
    "# FLOP challenge review dossier",
    "",
    "DRY RUN ONLY. Human attachment. No dispute is submitted.",
    "",
    `Channel: ${dossier.channelId}`,
    `Captured: ${dossier.createdAt}`,
    `Content SHA-256: ${dossier.sha256}`,
    "",
    "Hash scope: canonical JSON of every field except top-level sha256. Hashes do not authenticate the source.",
    "",
    "## Window",
    "",
    window
      ? `${window.status}: end block ${window.endBlock ?? "unknown"}; reported finalized head ${window.headBlock ?? "unknown"}; remaining blocks ${window.remainingBlocks ?? "unknown"}.`
      : dossier.window.reason,
    ...(window
      ? [
          `Estimated remaining time: ${window.estimatedRemainingMs ?? "unavailable"} ms.`,
          escape(window.reason),
          `Parameter source: ${window.parameter.source}`,
          `${fence}text\n${window.parameter.quote}\n${fence}`,
        ]
      : []),
    "",
    "## Evidence",
    "",
    ...dossier.verifier.report.checks.map((c) => `- ${c.status}: ${escape(c.claim)}. ${escape(c.detail)}`),
    "",
    "## Limits",
    "",
    "Public-view consistency is not independent inference proof, hardware authentication, finality or challenge standing. Unavailable and simulated evidence remains labelled.",
    "",
    "## Portable JSON",
    "",
    "Extract this JSON and run flop-challenger replay <file>. Verifier checks run without network access.",
    "",
    `${fence}json`,
    json,
    fence,
    "",
  ].join("\n");
}
