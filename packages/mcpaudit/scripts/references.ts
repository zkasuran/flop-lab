// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { object } from "../src/schema";
import { parseIntelAdvisory } from "../src/intel";
const sources = [
  "https://www.intel.com/content/www/us/en/security-center/advisory/intel-sa-00219.html",
  "https://raw.githubusercontent.com/CVEProject/cvelistV5/main/cves/2019/0xxx/CVE-2019-0117.json",
  "https://api.github.com/repos/flop-labs/network/issues/36",
];
const recordings = [];
for (const source of sources) {
  const response = await fetch(source, {
    headers: { "User-Agent": "flop-lab-contract-audit/0.1" },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 190_000) throw new Error("Reference body too large");
  recordings.push({ source, measuredAt: new Date().toISOString(), status: response.status, raw });
}
const cveRecording = recordings[1];
if (!cveRecording || cveRecording.status !== 200) throw new Error("No CVE record");
const cve = object(JSON.parse(cveRecording.raw));
const metadata = object(cve.cveMetadata);
const cna = object(object(cve.containers).cna);
if (
  metadata.assignerShortName !== "intel" ||
  !Array.isArray(cna.references) ||
  !cna.references.some((r) => object(r).url === sources[0])
)
  throw new Error("CVE not tied to Intel advisory");
const reference = {
  advisoryId: "INTEL-SA-00219",
  intelUrl: sources[0],
  intelHttpStatus: recordings[0]?.status,
  intel: recordings[0]?.status === 200 ? parseIntelAdvisory(recordings[0].raw) : null,
  cveId: metadata.cveId,
  cvePublished: metadata.datePublished,
  cveProduct: Array.isArray(cna.affected) ? object(cna.affected[0]).product : null,
  issueUrl: "https://github.com/flop-labs/network/issues/36",
  sources: recordings.map(({ source, measuredAt, status }) => ({ url: source, measuredAt, status })),
};
const serialize = (value: unknown) =>
  JSON.stringify(value)
    .replace(/\u2013/g, "\\u2013")
    .replace(/\u2014/g, "\\u2014") + "\n";
await writeFile(new URL("../fixtures/intel-raw.json", import.meta.url), serialize(recordings));
await writeFile(new URL("../fixtures/intel-reference.json", import.meta.url), serialize(reference));
console.log(serialize(reference));
