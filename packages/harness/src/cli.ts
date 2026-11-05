#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { runHarness } from "./runner";
import { parseReport, renderBugDraft, renderMarkdown } from "./report";
import { loadClaims } from "./catalogue";
import { serialize } from "./validation";
import type { Risk } from "./types";

const help = `flop-harness run [--only id] [--class read-only|spends-test-funds]
  [--max-requests 80] [--max-flop 0] [--allow-spend]
  [--out last-run.json] [--markdown last-run.md]
flop-harness list
flop-harness report <claim-id> [--input last-run.json]

Runs public devnet checks. A failure must reproduce before it is marked FAIL.
Spend scenarios report missing prerequisites. No write adapter is enabled.
Exit codes: 0 completed, 1 confirmed failure, 2 usage/input error, 3 selected checks incomplete.
`;

/** CLI entry point. @example await main(["run", "--only", "gateway-contract"]) */
export async function main(argv: string[]): Promise<number> {
  if (!argv.length || argv.includes("--help")) {
    console.log(help);
    return 0;
  }
  const command = argv[0];
  const args = argv.slice(1);
  const values = new Map<string, string>();
  let allowSpend = false;
  let id: string | undefined;
  const allowed =
    command === "run"
      ? ["--only", "--class", "--max-requests", "--max-flop", "--out", "--markdown"]
      : command === "report"
        ? ["--input"]
        : [];
  if (command === "report") id = args.shift();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (flag === "--allow-spend" && command === "run" && !allowSpend) {
      allowSpend = true;
      continue;
    }
    if (!allowed.includes(flag) || values.has(flag)) throw new Error(`Unknown or repeated option: ${flag}`);
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
  }
  if (command === "list") {
    console.log(serialize(await loadClaims()));
    return 0;
  }
  if (command === "run") {
    const risk = values.get("--class");
    if (risk && risk !== "read-only" && risk !== "spends-test-funds") throw new Error("Unknown risk class");
    const rawRequests = values.get("--max-requests") ?? "80";
    if (!/^\d+$/.test(rawRequests)) throw new Error("max-requests must be a nonnegative integer");
    const out = values.get("--out") ?? "last-run.json";
    const markdown = values.get("--markdown") ?? "last-run.md";
    if (resolve(out) === resolve(markdown)) throw new Error("JSON and Markdown output paths must differ");
    const report = await runHarness({
      only: values.get("--only"),
      risk: risk as Risk | undefined,
      maxRequests: Number(rawRequests),
      maxFlop: values.get("--max-flop"),
      allowSpend,
    });
    await writeFile(out, serialize(report));
    await writeFile(markdown, renderMarkdown(report));
    const counts = Object.fromEntries(
      ["PASS", "FAIL", "UNVERIFIABLE", "SKIPPED"].map((status) => [
        status,
        report.results.filter((result) => result.status === status).length,
      ]),
    );
    console.log(
      serialize({
        measuredAt: report.measuredAt,
        requests: report.budget.requests,
        durationMs: report.durationMs,
        counts,
        out,
        markdown,
      }),
    );
    if (report.results.some((result) => result.status === "FAIL")) return 1;
    if (
      report.results.some(
        (result) => result.status === "UNVERIFIABLE" || result.reason === "Global request budget exhausted",
      )
    )
      return 3;
    return 0;
  }
  if (command === "report") {
    if (!id) throw new Error("A claim id is required");
    const report = parseReport(JSON.parse(await readFile(values.get("--input") ?? "last-run.json", "utf8")));
    const result = report.results.find((result) => result.claim.id === id);
    if (!result || result.status !== "FAIL" || result.flaky)
      throw new Error("Only a confirmed FAIL can become a draft");
    const { stdout } = await promisify(execFile)(
      "gh",
      ["api", "repos/flop-labs/flop-core/commits/HEAD", "--jq", ".sha"],
      { timeout: 20_000 },
    );
    console.log(
      renderBugDraft(report, id, {
        sha: stdout.trim(),
        measuredAt: new Date().toISOString(),
        source: "https://api.github.com/repos/flop-labs/flop-core/commits/HEAD",
      }),
    );
    return 0;
  }
  throw new Error(`Unknown command: ${command}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    });
}
