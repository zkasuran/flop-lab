// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import snapshot from "../fixtures/site.json";
import { McpClient } from "../../mcp/src/index";
import { EvidenceFetcher } from "../../verifier/src/index";
import { analyzeWindows, collectWindows } from "../src/windows";

const client = new McpClient({ retries: 1, minIntervalMs: 300 });
const save = async (file: string, value: unknown) => {
  const raw =
    JSON.stringify(value)
      .replaceAll(String.fromCharCode(0x2013), "\\u2013")
      .replaceAll(String.fromCharCode(0x2014), "\\u2014") + "\n";
  if (Buffer.byteLength(raw) > 200_000) throw new Error(`${file} exceeds fixture limit`);
  await writeFile(new URL(`../fixtures/windows/${file}`, import.meta.url), raw);
};
const capture = await collectWindows(client);
await save("capture.json", capture);
const report = analyzeWindows(capture);
console.log(
  JSON.stringify({
    capturedAt: capture.capturedAt,
    requests: capture.requests,
    head: report.head,
    cadence: report.cadence,
    windows: report.rows.map((r) => ({
      id: r.channelId,
      end: r.endBlock,
      status: r.status,
      remaining: r.remainingBlocks,
    })),
    warnings: report.warnings,
  }),
);
const fetcher = new EvidenceFetcher({ client });
await save("paid-bundle.json", await fetcher.channel(snapshot.settlements[0]!.channelId, { maxRows: 25 }));
const id = report.rows[0]?.channelId;
if (id) await save("forced-bundle.json", await fetcher.channel(id, { maxRows: 25 }));
console.log(JSON.stringify({ requests: client.stats.requests, retries: client.stats.retries }));
