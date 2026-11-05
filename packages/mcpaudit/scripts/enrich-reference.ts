// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { parseIntelAdvisory } from "../src/intel";
const base = new URL("../fixtures/", import.meta.url);
const recordings = JSON.parse(await readFile(new URL("intel-raw.json", base), "utf8")) as {
  status: number;
  raw: string;
}[];
const reference = JSON.parse(await readFile(new URL("intel-reference.json", base), "utf8")) as Record<string, unknown>;
if (recordings[0]?.status !== 200) throw new Error("Intel reference unavailable");
delete reference.issueReportedRelease;
reference.intel = parseIntelAdvisory(recordings[0].raw);
await writeFile(
  new URL("intel-reference.json", base),
  JSON.stringify(reference)
    .replace(/\u2013/g, "\\u2013")
    .replace(/\u2014/g, "\\u2014") + "\n",
);
