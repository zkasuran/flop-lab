#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { homedir } from "node:os";
import { lintAccess } from "./access.js";
import { collectCommunity } from "./collect.js";
import { rows } from "./model.js";
import { recordedSnapshot } from "./recorded.js";

const help = `flop-community [--json] [--live] [--cache-dir PATH]
flop-community lint-access < issue.md

Default: bundled dated metadata. --live: public GitHub and chat reads, cached six hours.
Latest 25 issues or PRs per repository. No full-backlog or service-level claim.
lint-access reads stdin locally and prints field names only. Exit 1 means incomplete.
The cache directory owns a rolling 24-hour limit of 20 chat requests. Keep it between runs.`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(help);
    return;
  }
  if (args[0] === "lint-access") {
    if (args.length !== 1) throw new Error("lint-access accepts stdin only");
    let body = "",
      bytes = 0;
    for await (const chunk of process.stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      bytes += buffer.byteLength;
      if (bytes > 65536) throw new Error("Access form exceeds 64 KiB");
      body += buffer.toString("utf8");
    }
    const result = lintAccess(body);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
    return;
  }
  let live = false,
    json = false,
    cacheDir = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "flop-community");
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--live") live = true;
    else if (arg === "--json") json = true;
    else if (arg === "--cache-dir" && args[i + 1] && !args[i + 1]!.startsWith("-")) cacheDir = args[++i]!;
    else throw new Error("Unknown or incomplete option. Use --help.");
  }
  const result = live
    ? await collectCommunity({ cacheDir })
    : { snapshot: recordedSnapshot(), cached: false, requests: 0 };
  if (json) {
    console.log(
      JSON.stringify(
        {
          mode: live ? (result.cached ? "cached" : "live") : "recorded",
          requestsThisRun: result.requests,
          snapshot: result.snapshot,
          items: rows(result.snapshot),
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(
    `Community ${live ? (result.cached ? "cached" : "live") : "recorded"} | ${result.snapshot.measuredAt} | requests this run: ${result.requests}`,
  );
  console.log("Latest 25 items per repository. Response = first observed non-author human maintainer thread comment.");
  for (const repo of result.snapshot.repos)
    console.log(
      `${repo.repo}: ${repo.items.length} sampled${repo.hasMore ? ", older items omitted" : ""}${repo.error ? `, ${repo.error}` : ""} | ${repo.measuredAt} | ${repo.source}`,
    );
  for (const item of rows(result.snapshot))
    console.log(
      `${item.repo}#${item.number} ${item.pull_request ? "PR" : "issue"} ${item.area}/${item.type} ${item.state} | response ${item.responseHours === null ? item.responseState : `${item.responseHours.toFixed(2)}h`} | close ${item.closeHours === null ? "not closed" : `${item.closeHours.toFixed(2)}h`} | ${item.source}`,
    );
  for (const chat of result.snapshot.chat)
    console.log(
      `${chat.source} | rooms ${chat.rooms ?? "unavailable"} | messages ${chat.messages ?? "unavailable"} | ${chat.measuredAt}${chat.error ? ` | ${chat.error}` : ""}`,
    );
}
main().catch(() => {
  console.error("Community command failed. Check options, connectivity and cache state. No input values are logged.");
  process.exitCode = 2;
});
