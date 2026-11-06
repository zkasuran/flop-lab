// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { parseIssues } from "../src/issues";

// Explicit public citations in Appendix E plus its public erratum. Bare tracker IDs are internal.
const numbers = [3, 13, 31, 32, 235];
const measuredAt = new Date().toISOString();
const recordings: unknown[] = [];
for (const number of numbers) {
  const source = `https://api.github.com/repos/flop-labs/yellowpaper/issues/${number}`;
  const response = await fetch(source, {
    headers: { "User-Agent": "flop-lab-yellowpaper-reader", Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}; stopped without retry`);
  const raw = await response.text();
  recordings.push({ source, measuredAt, raw });
  parseIssues(recordings);
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
const serialized =
  JSON.stringify(recordings, null, 2).replace(/[\u2013\u2014]/g, (char) => `\\u${char.charCodeAt(0).toString(16)}`) +
  "\n";
if (Buffer.byteLength(serialized) > 200_000) throw new Error("Issue fixture exceeds size limit");
await writeFile(new URL("../fixtures/issues.json", import.meta.url), serialized);
console.log(
  JSON.stringify({
    issues: parseIssues(recordings).issues.length,
    requests: recordings.length,
    bytes: Buffer.byteLength(serialized),
    measuredAt,
  }),
);
