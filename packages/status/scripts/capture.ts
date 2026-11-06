// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { probeServices, type RawResponse } from "../src/probe";
const folder = fileURLToPath(new URL("../test/fixtures/", import.meta.url));
await mkdir(folder, { recursive: true });
const raw: RawResponse[] = [];
const run = await probeServices({
  observer: "local-build-c18",
  onResponse: (r) => {
    raw.push(r);
  },
});
const name = run.startedAt.replaceAll(":", "-");
const directory = `${folder}${name}`;
await mkdir(directory, { recursive: true });
for (const { body, ...meta } of raw) {
  // JSON string encoding preserves source bytes while escaping prohibited typography in repository text.
  const encoded = JSON.stringify(body).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  if (Buffer.byteLength(encoded) > 200_000) throw new Error("Encoded fixture exceeds repository limit");
  await writeFile(`${directory}/${meta.service}.body.json`, encoded + "\n");
  await writeFile(`${directory}/${meta.service}.meta.json`, JSON.stringify(meta) + "\n");
}
await writeFile(`${directory}/run.json`, JSON.stringify(run, null, 2) + "\n");
const runs = await Promise.all(
  (await readdir(folder, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map(async (d) => JSON.parse(await readFile(`${folder}${d.name}/run.json`, "utf8")) as unknown),
);
await writeFile(`${folder}history.jsonl`, runs.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(
  JSON.stringify(
    {
      directory,
      requests: run.requests,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      probes: run.probes.map((p) => ({
        service: p.service,
        outcome: p.outcome,
        httpStatus: p.httpStatus,
        bytes: p.bytes,
        latencyMs: p.latencyMs,
      })),
    },
    null,
    2,
  ),
);
