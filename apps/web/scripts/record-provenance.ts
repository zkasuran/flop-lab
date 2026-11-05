// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { parsePullRequests } from "../lib/provenance";

const source = "https://api.github.com/repos/zkasuran/flop-lab/pulls/8";
const response = await fetch(source, {
  headers: { Accept: "application/vnd.github+json", "User-Agent": "flop-lab-web-fixture/0.1" },
  signal: AbortSignal.timeout(10000),
});
if (!response.ok) throw new Error(`GitHub HTTP ${response.status}. No automatic retry.`);
const raw = await response.text();
if (Buffer.byteLength(raw) > 190000) throw new Error("Fixture exceeds the size limit");
const [pr] = parsePullRequests([JSON.parse(raw)]);
const measuredAt = new Date().toISOString();
await writeFile(
  new URL("../tests/fixtures/pull-request.json", import.meta.url),
  `${JSON.stringify({ measuredAt, source, raw }, null, 2)}\n`,
);
console.log(JSON.stringify({ measuredAt, source, bytes: Buffer.byteLength(raw), head: pr?.head }));
