// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { parseRecording, repositories } from "./model";

// Explicit refresh only. A build reads the saved recordings and makes no GitHub requests.
for (const repository of repositories) {
  const raw = execFileSync(
    "gh",
    [
      "issue",
      "list",
      "--repo",
      repository,
      "--author",
      "zkasuran",
      "--state",
      "all",
      "--limit",
      "100",
      "--json",
      "number,title,url,state,createdAt,updatedAt,closedAt",
    ],
    { encoding: "utf8", timeout: 30_000, maxBuffer: 200_000 },
  );
  const recording = {
    repository,
    measuredAt: new Date().toISOString(),
    source: `https://github.com/${repository}/issues?q=is%3Aissue+author%3Azkasuran`,
    limit: 100,
    raw,
  };
  const checked = parseRecording(recording);
  const path = new URL(`./${repository.split("/")[1]}.json`, import.meta.url);
  const content =
    JSON.stringify(recording, null, 2).replace(/[\u2013\u2014]/g, (char) => `\\u${char.charCodeAt(0).toString(16)}`) +
    "\n";
  writeFileSync(path, content);
  console.log(
    `${repository}: ${checked.issues.length} issues recorded at ${recording.measuredAt}; ${Buffer.byteLength(content)} bytes`,
  );
}
