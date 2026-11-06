// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
const sha = "2a2cc8218048a2933071bb2f45d75335560e39d8";
const source = `https://raw.githubusercontent.com/flop-labs/yellowpaper/${sha}/yellowpaper.md`;
const response = await fetch(source, { signal: AbortSignal.timeout(20000) });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const lines = (await response.text()).split("\n");
const excerpts = [
  [1776, 1918],
  [2141, 2150],
  [2165, 2182],
  [2913, 2916],
  [3226, 3267],
].map(([start, end]) => ({ startLine: start, endLine: end, raw: lines.slice(start! - 1, end).join("\n") }));
const parameterSource = `https://raw.githubusercontent.com/flop-labs/yellowpaper/${sha}/params/flop-protocol-params.yaml`;
const paramsResponse = await fetch(parameterSource, { signal: AbortSignal.timeout(20000) });
if (!paramsResponse.ok) throw new Error(`HTTP ${paramsResponse.status}`);
const params = await paramsResponse.text();
const names = [
  "genesis_supply",
  "initial_block_reward",
  "halving_interval_blocks",
  "max_halvings",
  "floor_reward",
  "miner_share_ppt",
  "validator_share_ppt",
  "agent_share_ppt",
  "staker_share_ppt",
  "subsidy_per_block_per_recipient",
  "subsidy_duration_blocks",
  "inference_fee_miner_share_ppt",
  "inference_fee_validator_share_ppt",
  "audit_fee_split_ppm",
];
const parameters = names.map((name) => {
  const block = params.split(/(?=^ {2}- name: )/m).find((s) => s.startsWith(`  - name: ${name}\n`));
  if (!block) throw new Error(`Missing ${name}`);
  const value = /^ {4}value: (.+)$/m.exec(block)?.[1];
  if (!value) throw new Error(`Missing value for ${name}`);
  return { name, value, raw: block };
});
const data = { sha, source, parameterSource, measuredAt: new Date().toISOString(), excerpts, parameters };
const text = JSON.stringify(data, null, 2).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
await writeFile(new URL("../fixtures/spec.json", import.meta.url), text + "\n");
console.log(
  JSON.stringify({
    measuredAt: data.measuredAt,
    bytes: Buffer.byteLength(text),
    parameters: parameters.map(({ name, value }) => ({ name, value })),
  }),
);
