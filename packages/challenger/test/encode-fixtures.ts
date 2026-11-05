// SPDX-License-Identifier: Apache-2.0
// Lossless transport encoding keeps source punctuation rules without changing recorded bytes.
import { readFile, writeFile } from "node:fs/promises";

const directory = new URL("../fixtures/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8")) as { file: string }[];
for (const entry of manifest) {
  if (entry.file.endsWith(".base64")) continue;
  const raw = await readFile(new URL(entry.file, directory));
  if (!/[\u2013\u2014]/.test(raw.toString("utf8"))) continue;
  const old = entry.file;
  entry.file += ".base64";
  const encoded = raw.toString("base64") + "\n";
  if (Buffer.byteLength(encoded) > 200_000) throw new Error("Encoded fixture too large");
  await writeFile(new URL(entry.file, directory), encoded);
  console.log(`Encoded ${old} losslessly as ${entry.file}. Remove the original before committing.`);
}
await writeFile(new URL("manifest.json", directory), JSON.stringify(manifest, null, 2) + "\n");
