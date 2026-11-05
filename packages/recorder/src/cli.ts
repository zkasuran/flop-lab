#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { analyze } from "./analysis";
import { recordSnapshot } from "./record";
import { parseSnapshot } from "./schema";
import { readIndex, storeSnapshot } from "./store";

const help = `flop-recorder record --store <directory> [--evidence <directory>]
flop-recorder analyze --store <directory>
flop-recorder verify <snapshot.json>

Read-only. Each run has a 24-request ceiling, including an 8-request harness budget.
Stores snapshots and a rolling index locally. Does not push to GitHub.`;
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { help: { type: "boolean" }, store: { type: "string" }, evidence: { type: "string" } },
  });
  const command = positionals[0];
  if (values.help || !command) console.log(help);
  else if (command === "record" && positionals.length === 1 && values.store) {
    const { snapshot, evidence } = await recordSnapshot();
    await storeSnapshot(values.store, snapshot);
    if (values.evidence) {
      const directory = join(values.evidence, snapshot.id);
      await mkdir(directory, { recursive: true });
      for (const [i, item] of evidence.entries())
        await writeFile(
          join(directory, `${i + 1}.json`),
          JSON.stringify(item).replace(/[\u2013\u2014]/g, (char) => `\\u${char.charCodeAt(0).toString(16)}`) + "\n",
          { flag: "wx" },
        );
    }
    console.log(
      JSON.stringify({
        id: snapshot.id,
        measuredAt: snapshot.startedAt,
        requests: snapshot.requests,
        durationMs: snapshot.durationMs,
        bytes: Buffer.byteLength(JSON.stringify(snapshot) + "\n"),
        sources: Object.fromEntries(Object.entries(snapshot.observations).map(([key, o]) => [key, o.status])),
      }),
    );
  } else if (command === "analyze" && positionals.length === 1 && values.store)
    console.log(JSON.stringify(analyze(await readIndex(values.store)), null, 2));
  else if (command === "verify" && positionals.length === 2) {
    const snapshot = await parseSnapshot(JSON.parse(await readFile(positionals[1]!, "utf8")));
    console.log(JSON.stringify({ id: snapshot.id, contentHash: "matches", authenticity: "not verified" }));
  } else throw new Error(help);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
