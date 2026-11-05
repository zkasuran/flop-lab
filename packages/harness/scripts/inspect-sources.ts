// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { extractDocument, type SourceDocument } from "../src/extraction";
const manifest = JSON.parse(await readFile(new URL("../fixtures/sources/manifest.json", import.meta.url), "utf8")) as {
  documents: { id: string; file: string; format: string }[];
};
for (const item of manifest.documents) {
  if (process.argv[2] ? !item.id.match(process.argv[2]) : item.format !== "html") continue;
  const doc = JSON.parse(
    await readFile(new URL(`../fixtures/sources/${item.file}`, import.meta.url), "utf8"),
  ) as SourceDocument;
  console.log(`\n## ${doc.id}`);
  for (const unit of extractDocument(doc)) {
    if (process.argv[3] && !unit.quote.match(new RegExp(process.argv[3], "i"))) continue;
    console.log(`${unit.id} ${unit.quote.slice(0, 850)}`);
  }
}
