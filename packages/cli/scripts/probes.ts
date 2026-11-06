// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";

/** Offline audit invocations. Example: jsonProbes(repoRoot, tempDir). */
export function jsonProbes(root: string, temp: string): Record<string, string[]> {
  const file = (path: string) => join(root, "packages", path);
  return {
    status: ["history", "--file", file("status/test/fixtures/history.jsonl"), "--json"],
    community: ["--json"],
    export: ["blocks", "--recorded", "--rows", "1", "--out", join(temp, "export"), "--json"],
    watch: ["check", "--rules", join(temp, "watch.yaml"), "--json"],
    upgrades: ["--json"],
    knowledge: ["catalog", "--json"],
    "spec-read": ["index", "--json"],
    metering: ["observe", "--json"],
    invariants: ["catalogue", "--json"],
    swap: ["observe", "--recorded", "--json"],
    finality: ["snapshot", "--recorded", "--json"],
    proofs: ["coverage", "--json"],
    did: ["trail", "did:key:z6MkoA8xuzKJRGtHa5hr6znFCZq164mb45JHx6kktdJ6tMdL", "--recorded", "--json"],
    economics: ["compare", "--json"],
    sessions: ["list", "--json"],
    models: ["--input", file("models/test/fixtures/devnet.json"), "--json"],
    call: ["list", "--json"],
    start: ["--json"],
    indexer: ["run", "--snapshot", file("indexer-audit/fixtures/devnet.json"), "--json"],
    tclk: ["inspect", join(temp, "empty.json"), "--offline", "--json"],
    contracts: ["run", "--tool", "flop_get_stats", "--json"],
    history: ["analyze", "--store", temp, "--json"],
    explore: ["block:1", "--json"],
    doctor: ["miner", "--offline", "--skip-ports", "--json"],
    spec: ["diff", "--json"],
    verify: ["bundle", join(temp, "empty.json"), "--json"],
    harness: ["list", "--json"],
    score: ["rank", "--file", file("scoreboard/fixtures/snapshot-04.json"), "--json"],
    guard: ["lint", file("spendguard/examples/policy.json"), "--json"],
    challenge: ["windows", "--recorded", "--json"],
    x402: ["inspect", file("x402kit/fixtures/headers.json"), "--json"],
    sdk: ["run", "--sdk", "sdk", "--json"],
    stake: ["observed", "--json"],
  };
}
