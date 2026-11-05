// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const directory = new URL("../fixtures/sdk/", import.meta.url);
await mkdir(directory, { recursive: true });
const manifest: unknown[] = [];
for (const name of [
  "chain.d.ts",
  "chain.js",
  "dispute.d.ts",
  "protocol.d.ts",
  "da.d.ts",
  "toploc-checker.d.ts",
  "toploc-evidence.d.ts",
]) {
  const source = `https://unpkg.com/@flop-labs/sdk@0.4.0/dist/compute-channel/${name}`;
  const response = await fetch(source, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`SDK reference HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const encoded = bytes.toString("base64") + "\n";
  if (Buffer.byteLength(encoded) > 200_000) throw new Error("SDK fixture exceeds limit");
  const file = `${name}.base64`;
  await writeFile(new URL(file, directory), encoded);
  manifest.push({
    source,
    file,
    measuredAt: new Date().toISOString(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    encoding: "base64",
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
}
await writeFile(new URL("manifest.json", directory), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
