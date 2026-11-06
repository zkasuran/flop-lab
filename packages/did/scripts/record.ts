// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fingerprint } from "../src/crypto.js";
import { cachedReader } from "../src/reader.js";
import { parseObservation } from "../src/trail.js";

const did = "did:key:z6MkoA8xuzKJRGtHa5hr6znFCZq164mb45JHx6kktdJ6tMdL";
const fp = await fingerprint(did);
const sources: [string, string][] = [
  ["note-sharded", `https://technocore.chat/kv/did-${fp.slice(0, 2)}/${fp.slice(2)}`],
  ["note-legacy", `https://technocore.chat/kv/did/${fp}`],
  ["note-agent", `https://technocore.chat/kv/agent/${fp}`],
  ["room", "https://technocore.chat/r/technocore?format=json&limit=100"],
  [
    "github",
    `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:zkasuran/flop-lab "${did}" in:body`)}&per_page=3&sort=updated&order=desc`,
  ],
  ["build", "https://raw.githubusercontent.com/zkasuran/flop-lab/main/SIGNATURE.json"],
];
const reader = cachedReader(process.env.FLOP_DID_CACHE ?? "/tmp/flop-did-cache-b09");
await mkdir(new URL("../fixtures/", import.meta.url), { recursive: true });
for (const [file, source] of sources) {
  let record;
  try {
    record = parseObservation(JSON.parse(await readFile(new URL(`../fixtures/${file}.json`, import.meta.url), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    record = await reader(source);
  }
  const json =
    JSON.stringify(record, null, 2)
      .replaceAll(String.fromCharCode(0x2014), "\\u2014")
      .replaceAll(String.fromCharCode(0x2013), "\\u2013") + "\n";
  if (Buffer.byteLength(json) > 200_000) throw new Error(`Fixture too large: ${file}`);
  await writeFile(new URL(`../fixtures/${file}.json`, import.meta.url), json);
  console.log(
    JSON.stringify({ file, status: record.status, bytes: Buffer.byteLength(json), measuredAt: record.measuredAt }),
  );
  if (file === "github") {
    const page = JSON.parse(record.raw) as { items: { body: string }[] };
    const seqs = page.items
      .map((item) => Number(/attestation seq `(\d+)`/.exec(item.body)?.[1]))
      .filter(Number.isSafeInteger);
    if (seqs.length)
      sources.push([
        "attestation-room",
        `https://technocore.chat/r/technocore?format=json&limit=100&since=${Math.max(...seqs) - 1}`,
      ]);
  }
  if (record.status === 429 || record.status >= 500) break;
}
