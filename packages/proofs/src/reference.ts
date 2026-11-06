// SPDX-License-Identifier: Apache-2.0
import section from "../fixtures/paper-section3.json";
import parameters from "../fixtures/paper-parameters.json";
import calls from "../fixtures/paper-calls.json";

export type Quote = { quote: string; source: string; measuredAt: string; line: number };
const paperUrl = `https://github.com/flop-labs/yellowpaper/blob/${section.sha}/yellowpaper.md`;
function quote(excerpt: string): Quote {
  const offset = section.raw.indexOf(excerpt);
  if (offset < 0) throw new Error("Quoted proof requirement is missing from the pinned paper");
  const line = section.startLine + section.raw.slice(0, offset).split("\n").length - 1;
  return { quote: excerpt, source: `${paperUrl}#L${line}`, measuredAt: section.measuredAt, line };
}

/** Quoted specification requirements, not a claim that the deployed runtime enforces them.
 * @example proofReference().types[0].evidence
 */
export function proofReference() {
  return {
    sha: section.sha,
    measuredAt: section.measuredAt,
    source: paperUrl,
    types: [
      {
        id: "tee",
        name: "TEE attestation",
        requirement: "Optional HARD tier",
        establishes: "Hardware environment and bound measurements. Requires the independent fallback.",
        evidence: quote("The attestation proves the *environment*,\n**not which model ran**"),
        limit: "A quote alone does not establish which inference ran. This tool does not verify quotes.",
      },
      {
        id: "toploc",
        name: "TOPLOC commitment",
        requirement: "Required for every session",
        establishes: "Commitment to prefill activations for later checks.",
        evidence: quote(
          "cheap *detection* of model/prompt/precision swap on the committed prefill activations; decode-step coverage is open (E.43)",
        ),
        limit:
          "Detection is conditional on validated cells and the commitment, challenge and adjudication assumptions. Decode coverage is open.",
      },
      {
        id: "reexecution",
        name: "Independent re-execution",
        requirement: "Required fallback",
        establishes: "Sampled or challenged work is checked in a different trust domain.",
        evidence: quote(
          "Security against a compromised fast path is conditional on effective re-execution in a **different trust\ndomain**.",
        ),
        limit:
          "Deterrence depends on effective monitoring, available evidence and collectible penalties. A sample does not check every turn.",
      },
      {
        id: "aggregation",
        name: "Quorum and aggregation",
        requirement: "Direct-rail credit gate",
        establishes: "Validator attestations bind the credited statement. Merkle aggregation supports dispatch.",
        evidence: quote("they do not prove the inference."),
        limit:
          "Aggregation is not a proof of the inference forward pass. The indexer does not expose the validator bundle.",
      },
    ],
    rail: quote("**paid agent\nsessions settle through the compute channel** (§12.1)"),
    binding: quote(
      "An accepted proof/attestation **MUST** bind, at minimum, `task_hash`, the metered\n  `gn_weight`, the measured `model_hash`, and the `output_hash`",
    ),
    parameters: parameters.excerpts.map((e) => {
      const cells = e.raw.split("|");
      const name = /`([^`]+)`/.exec(cells[1] ?? "")?.[1];
      if (!name || !cells[2]) throw new Error("Invalid parameter excerpt");
      return {
        name,
        value: cells[2].trim(),
        description: cells[5]?.trim() ?? "",
        quote: cells[2].trim(),
        source: `${paperUrl}#L${e.line}`,
        measuredAt: parameters.measuredAt,
        line: e.line,
        status: "SPECIFICATION_ONLY" as const,
      };
    }),
    calls: calls.excerpts.map((e) => ({
      quote: e.raw.startsWith("|") ? `${e.raw.split("|")[1]!.trim()} | ${e.raw.split("|")[3]!.trim()}` : e.raw,
      source: `${paperUrl}#L${e.line}`,
      measuredAt: calls.measuredAt,
      line: e.line,
    })),
  };
}
