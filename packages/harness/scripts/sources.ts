// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { extractDocument, type SourceDocument } from "../src/extraction";
import { serialize } from "../src/validation";

const root = new URL("../fixtures/sources/", import.meta.url);
await mkdir(root, { recursive: true });
let requests = 0;
async function get(url: string) {
  if (requests) await new Promise((resolve) => setTimeout(resolve, 600));
  requests++;
  const response = await fetch(url, {
    headers: { "User-Agent": "flop-lab-harness-source-recorder/0.2" },
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Source HTTP ${response.status}: ${url}`);
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 1_000_000) throw new Error("Source exceeds byte ceiling");
  return { raw, measuredAt: new Date().toISOString(), url };
}
async function save(name: string, value: unknown) {
  const raw = serialize(value, 0);
  if (Buffer.byteLength(raw) > 200_000) throw new Error(`Fixture too large: ${name}`);
  await writeFile(new URL(name, root), raw);
}
const index = await get("https://docs.flop.network/llms.txt");
await save("index.json", index);
const documents: SourceDocument[] = [];
for (const match of index.raw.matchAll(/^- \[([^\]]+)\]\((https:\/\/docs\.flop\.network\/docs\/([a-z0-9-]+))\)/gm)) {
  const doc: SourceDocument = {
    id: match[3]!,
    title: match[1]!,
    format: "html",
    firstLine: 1,
    ...(await get(match[2]!)),
  };
  extractDocument(doc);
  documents.push(doc);
  await save(`${doc.id}.json`, doc);
}
const sha = "2a2cc8218048a2933071bb2f45d75335560e39d8";
const paper = await get(`https://raw.githubusercontent.com/flop-labs/yellowpaper/${sha}/yellowpaper.md`);
const lines = paper.raw.split("\n");
let start = 0;
for (let i = 1; i <= lines.length; i++) {
  if (i < lines.length && !/^## /.test(lines[i]!)) continue;
  const raw = lines.slice(start, i).join("\n");
  const title = lines[start]?.replace(/^## /, "") || "Yellowpaper preamble";
  const doc: SourceDocument = {
    id: `paper-${start + 1}`,
    title,
    url: `https://github.com/flop-labs/yellowpaper/blob/${sha}/yellowpaper.md`,
    measuredAt: paper.measuredAt,
    format: "markdown",
    raw,
    firstLine: start + 1,
  };
  documents.push(doc);
  await save(`${doc.id}.json`, doc);
  start = i;
}
const manifest = documents.map(({ raw, ...doc }) => ({
  ...doc,
  units: extractDocument({ ...doc, raw }).length,
  file: `${doc.id}.json`,
}));
await save("manifest.json", { index: index.url, measuredAt: index.measuredAt, sha, requests, documents: manifest });
console.log(
  serialize({
    requests,
    docs: documents.filter((d) => d.format === "html").length,
    paperSections: documents.filter((d) => d.format === "markdown").length,
    units: documents.flatMap(extractDocument).length,
    measuredAt: index.measuredAt,
  }),
);
