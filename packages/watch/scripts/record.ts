// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { createCollector } from "../src/collect";
import { example, parseConfig } from "../src/config";
import seed from "../../recorder/test/fixtures/seed/snapshots/2026/11/05/21-23-37.342Z-6d4ce0af9956856d65c2025259b7f6b4cd63e8b2897b5c6a6f3c141b225c7d81.json";
const address = (seed.observations.settlements.value as { data: { agent: string }[] }).data[0]!.agent;
const config = parseConfig({
  ...example,
  maxRequests: 12,
  rules: [
    ...example.rules,
    { id: "address", kind: "settlement", address },
    { id: "window", kind: "challenge-closing", withinBlocks: 100 },
  ],
});
const collector = createCollector(config);
const sample = await collector.collect();
const dir = new URL("../test/fixtures/", import.meta.url);
await mkdir(dir, { recursive: true });
const label = sample.startedAt.replaceAll(":", "-");
await writeFile(new URL(`${label}.json`, dir), JSON.stringify(sample));
for (const evidence of collector.transport.evidence)
  await writeFile(new URL(`${label}-raw-${evidence.id}.json`, dir), JSON.stringify(evidence));
console.log(
  JSON.stringify({
    file: `${label}.json`,
    requests: sample.requests,
    bytes: Buffer.byteLength(JSON.stringify(sample)),
    observations: sample.observations.map((o) => ({
      key: o.key,
      status: o.status,
      error: o.error,
      bytes: o.raw?.length,
    })),
  }),
);
