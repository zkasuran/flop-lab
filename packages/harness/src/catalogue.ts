// SPDX-License-Identifier: Apache-2.0
import { readFile, readdir } from "node:fs/promises";
import type { Claim } from "./types";
import { object, schemaErrors } from "./validation";

const claimSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "source", "kind", "risk", "expected", "check"],
  properties: {
    id: { type: "string", pattern: "^[a-z][a-z0-9-]+$" },
    title: { type: "string", minLength: 1 },
    source: {
      type: "object",
      required: ["url", "quote", "measuredAt"],
      additionalProperties: false,
      properties: {
        url: { type: "string", pattern: "^https://" },
        quote: { type: "string", minLength: 1 },
        path: { type: "string" },
        measuredAt: { type: "string", minLength: 20 },
      },
    },
    kind: { enum: ["http", "mcp", "graphql", "chain", "sdk"] },
    risk: { enum: ["read-only", "spends-test-funds"] },
    expected: { type: "string", minLength: 1 },
    check: {
      enum: [
        "unavailable",
        "probe",
        "contracts",
        "expiry",
        "registry",
        "serving",
        "audit",
        "settlements",
        "pagination",
        "bad-input",
        "graphql",
        "simulated",
      ],
    },
    tool: { type: "string", pattern: "^flop_[a-z_]+$" },
    args: { type: "object" },
    reason: { type: "string" },
  },
};

/** Load JSON-compatible YAML 1.2 claim files and reject duplicates. @example await loadClaims() */
export async function loadClaims(directory = new URL("../claims/", import.meta.url)): Promise<Claim[]> {
  const claims: Claim[] = [];
  for (const name of (await readdir(directory)).filter((name) => name.endsWith(".yaml")).sort()) {
    const data: unknown = JSON.parse(await readFile(new URL(name, directory), "utf8"));
    if (!Array.isArray(data)) throw new Error(`Claim file ${name} must contain an array`);
    for (const entry of data) {
      const errors = schemaErrors(claimSchema, entry);
      if (errors.length) throw new Error(`Invalid claim in ${name}: ${JSON.stringify(errors)}`);
      const claim = object(entry) as unknown as Claim;
      if (claims.some((other) => other.id === claim.id)) throw new Error(`Duplicate claim ${claim.id}`);
      if (claim.tool && /secret/i.test(claim.tool))
        throw new Error("Private material generation is outside this catalogue");
      claims.push(claim);
    }
  }
  return claims;
}
