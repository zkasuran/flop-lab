// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { collectCommunity } from "./collect.js";
import { accessForm } from "./access.js";

const cacheDir = process.argv[2];
if (!cacheDir) throw new Error("Provide a persistent recording cache directory");
const start = performance.now();
const result = await collectCommunity({ cacheDir });
const serialized = JSON.stringify(result.snapshot);
if (Buffer.byteLength(serialized) > 200_000) throw new Error("Fixture exceeds limit");
await writeFile(new URL("../fixtures/snapshot.json", import.meta.url), `${serialized}\n`);
console.log(
  JSON.stringify(
    {
      measuredAt: result.snapshot.measuredAt,
      durationMs: performance.now() - start,
      requests: result.requests,
      cached: result.cached,
      fixtureBytes: Buffer.byteLength(serialized),
      repositories: result.snapshot.repos.map((r) => ({ repo: r.repo, items: r.items.length, error: r.error })),
      chat: result.snapshot.chat,
    },
    null,
    2,
  ),
);
const source = accessForm.source
  .replace("https://github.com/", "https://raw.githubusercontent.com/")
  .replace("/blob/", "/");
const response = await fetch(source, {
  headers: { "User-Agent": "flop-lab-community/0.1" },
  signal: AbortSignal.timeout(12000),
  redirect: "error",
});
if (!response.ok) throw new Error("Pinned form unavailable");
const raw = await response.text();
if (raw.length > 20000) throw new Error("Form too large");
const form = { source, measuredAt: new Date().toISOString(), status: response.status, raw };
await writeFile(
  new URL("../fixtures/access-form.json", import.meta.url),
  `${JSON.stringify(form, null, 2)
    .replace(/\u2014/g, "\\u2014")
    .replace(/\u2013/g, "\\u2013")}\n`,
);
console.log(JSON.stringify({ formRequests: 1, source, measuredAt: form.measuredAt, status: form.status }));
