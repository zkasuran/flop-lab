// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { cells, splitValue } from "@flop-lab/spec";
import { loadInventory } from "../src/inventory";
import { serialize } from "../src/validation";
import type { Claim } from "../src/types";
const pages = await loadInventory();
const claims: Claim[] = [];
function add(pageId: string, unitId: string, id: string, title: string, check: string, args?: Record<string, unknown>) {
  const page = pages.find((page) => page.id === pageId)!;
  const unit = page.units.find((unit) => unit.id === unitId)!;
  if (!unit) throw new Error(`Missing quoted unit: ${unitId}`);
  claims.push({
    id,
    title,
    source: {
      url: page.url + (page.format === "markdown" ? `#L${unit.line}` : ""),
      quote: unit.quote,
      path: unit.id,
      measuredAt: page.measuredAt,
    },
    kind: "mcp",
    risk: "read-only",
    check,
    ...(args ? { args } : {}),
    expected:
      check === "catalog-parameter"
        ? `Public source catalog ${args!.name} equals ${args!.value} ${args!.unit}. This does not establish runtime enforcement.`
        : title,
  });
}
for (const page of pages.filter((page) => page.format === "markdown")) {
  for (const unit of page.units) {
    const row = cells(unit.quote);
    const name = row[0]?.match(/id="param-([a-z0-9_]+)"/)?.[1];
    if (!name || !row[1]) continue;
    add(
      page.id,
      unit.id,
      `paper-${name.replaceAll("_", "-")}`,
      `Catalog agrees with paper: ${name}`,
      "catalog-parameter",
      { name, ...splitValue(row[1]) },
    );
  }
}
const parameters = [
  ["protocol-parameters-l18-4", "initial_block_reward", "96", "FLOP"],
  ["protocol-parameters-l18-5", "halving_interval_blocks", "63072000", "blocks"],
  ["protocol-parameters-l18-6", "max_halvings", "5", "count"],
  ["protocol-parameters-l18-7", "miner_share_ppt", "75", "%"],
  ["protocol-parameters-l18-8", "validator_share_ppt", "10", "%"],
  ["protocol-parameters-l18-9", "agent_share_ppt", "10", "%"],
  ["protocol-parameters-l18-10", "staker_share_ppt", "5", "%"],
  ["protocol-parameters-l20-16", "validator_active_set_cap", "1000", "validators"],
  ["protocol-parameters-l22-19", "min_miner_self_stake", "10000", "FLOP"],
  ["protocol-parameters-l22-22", "miner_stake_revocation_latency_blocks", "604800", "blocks"],
  ["protocol-parameters-l25-26", "soft_tier_spot_check_rate_ppm", "2.5", "%"],
  ["protocol-parameters-l25-29", "channel_challenger_bond", "100", "FLOP"],
  ["protocol-parameters-l25-30", "slash_fraud_percent", "100", "%"],
] as const;
for (const [unit, name, value, metric] of parameters)
  add(
    "protocol-parameters",
    unit,
    `docs-${name.replaceAll("_", "-")}`,
    `Catalog agrees with docs: ${name}`,
    "catalog-parameter",
    { name, value, unit: metric },
  );
add(
  "send-to-specific-miner",
  "send-to-specific-miner-l38-12",
  "hosted-session-boundary",
  "Hosted MCP advertises read-only tools and omits flop_run_session",
  "hosted-read-only",
);
add(
  "send-to-specific-miner",
  "send-to-specific-miner-l38-12",
  "offer-miner-selection",
  "Sampled session offers match the requested miner filter",
  "offer-miner-filter",
);
await writeFile(new URL("../claims/extracted.yaml", import.meta.url), serialize(claims, 0));
// Existing predicates are linked only where the quoted source supports their limited assertion.
const links: Record<string, string> = {
  "gateway-contract": "sdk-references-l32-18",
  "audit-rate": "protocol-parameters-l25-26",
};
const file = new URL("../claims/conformance.yaml", import.meta.url);
const existing = JSON.parse(await readFile(file, "utf8")) as Claim[];
for (const claim of existing) {
  const id = links[claim.id];
  if (!id) continue;
  const page = pages.find((page) => page.units.some((unit) => unit.id === id))!;
  const unit = page.units.find((unit) => unit.id === id)!;
  claim.source = { url: page.url, quote: unit.quote, path: id, measuredAt: page.measuredAt };
}
await writeFile(file, serialize(existing));
console.log(
  serialize({
    added: claims.length,
    sourcePages: pages.length,
    sourceUnits: pages.flatMap((page) => page.units).length,
  }),
);
