// SPDX-License-Identifier: Apache-2.0
/* global fetch, AbortSignal, Buffer, URL, console */
import { writeFile } from "node:fs/promises";

const sources = {
  miner: "https://docs.flop.network/docs/run-miner",
  validator: "https://docs.flop.network/docs/run-validator",
  config: "https://docs.flop.network/docs/operator-config-reference",
  parameters: "https://docs.flop.network/docs/protocol-parameters",
  economics: "https://docs.flop.network/docs/miner-and-validator-economics",
  access: "https://raw.githubusercontent.com/flop-labs/network/main/.github/ISSUE_TEMPLATE/access.yml",
  yellowpaper: "https://raw.githubusercontent.com/flop-labs/yellowpaper/main/yellowpaper.md",
};
for (const [name, source] of Object.entries(sources)) {
  const response = await fetch(source, {
    headers: { "user-agent": "flop-lab-doctor/0.1 source-recording" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  let raw = await response.text();
  let selection = "Complete raw response";
  if (name === "yellowpaper") {
    const section = (prefix) => {
      const start = raw.indexOf(prefix);
      const end = raw.indexOf("\n## ", start + prefix.length);
      return raw.slice(start, end < 0 ? undefined : end);
    };
    raw = [
      section("## 7. Hardware"),
      section("## 15. Validators"),
      ...raw.split("\n").filter((line) => line.includes('id="param-timing_max_clock_skew_ms"')),
    ].join("\n");
    selection = "Raw excerpts: complete sections 7 and 15 plus timing_max_clock_skew_ms parameter row";
  }
  const body =
    JSON.stringify(
      { source, recordedAt: new Date().toISOString(), status: response.status, selection, raw },
      null,
      2,
    ).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`) + "\n";
  if (Buffer.byteLength(body) > 200000) throw new Error(`${name}: oversized fixture`);
  await writeFile(new URL(`../test/fixtures/${name}.json`, import.meta.url), body);
  console.log(`${name}: ${Buffer.byteLength(body)} bytes`);
}
