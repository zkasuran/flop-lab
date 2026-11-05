// SPDX-License-Identifier: Apache-2.0
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deepStrictEqual } from "node:assert";

// Escape typography in the JSON container without changing decoded HTTP response bytes.
async function normalize(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await normalize(path);
    else if (entry.name.endsWith(".json")) {
      const raw = await readFile(path, "utf8");
      const escaped = raw.replace(/[\u2013\u2014]/g, (char) => `\\u${char.charCodeAt(0).toString(16)}`);
      deepStrictEqual(JSON.parse(raw), JSON.parse(escaped));
      if (raw !== escaped) await writeFile(path, escaped);
    }
  }
}
await normalize(new URL("../test/fixtures/", import.meta.url).pathname);
