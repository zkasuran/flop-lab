// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { loadClaims } from "./catalogue";
import { inventoryPage, parseDocument, type InventoryPage } from "./inventory";
import { array, object, text } from "./validation";

/** Load every indexed docs page and pinned paper section without network access. @example await loadInventory() */
export async function loadInventory(): Promise<InventoryPage[]> {
  const directory = new URL("../fixtures/sources/", import.meta.url);
  const manifest = object(JSON.parse(await readFile(new URL("manifest.json", directory), "utf8")));
  const claims = await loadClaims();
  const pages: InventoryPage[] = [];
  for (const item of array(manifest.documents)) {
    const name = text(object(item).file);
    if (!/^[a-z0-9-]+\.json$/.test(name)) throw new Error("Invalid source filename");
    const doc = parseDocument(JSON.parse(await readFile(new URL(name, directory), "utf8")));
    if (pages.some((page) => page.id === doc.id)) throw new Error("Duplicate source document");
    pages.push(inventoryPage(doc, claims));
  }
  return pages;
}
