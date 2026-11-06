#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { compare, createRuntimeReader, recordedSpec } from "@flop-lab/spec";
import { buildReader, displayText } from "./reader";
import { recordedIssues, recordedPaper, recordedReader } from "./recorded";
import { issuesFor } from "./issues";
import { searchIndex } from "./search";

try {
  const { values, positionals } = parseArgs({
    options: { help: { type: "boolean", short: "h" }, json: { type: "boolean" }, live: { type: "boolean" } },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(
      "flop-yellowpaper [index|search <words>|parameter <name>|section <anchor>|issues] [--json] [--live]\nReads the pinned paper beside dated catalog observations. --live refreshes catalog evidence only.\nIssue states are dated recordings; run pnpm --filter @flop-lab/yellowpaper record to refresh them.",
    );
  } else {
    const [command = "index", ...args] = positionals;
    if (!["index", "search", "parameter", "section", "issues"].includes(command))
      throw new Error(`Unknown command: ${command}`);
    if (["index", "issues"].includes(command) && args.length) throw new Error("Unexpected arguments");
    if (["parameter", "section"].includes(command) && args.length !== 1) throw new Error(`${command} needs one name`);
    if (command === "search" && !args.length) throw new Error("search needs words");
    let reader = recordedReader();
    let requests = 0;
    if (values.live) {
      const live = await createRuntimeReader()();
      requests = live.requests;
      reader = buildReader(
        recordedPaper(),
        compare(recordedSpec(), live.runtime, { mode: "live", at: new Date().toISOString() }),
      );
    }
    const issues = recordedIssues();
    const data =
      command === "search"
        ? searchIndex(reader.search, args.join(" "))
        : command === "parameter"
          ? reader.parameters.find((row) => row.name === args[0])
          : command === "issues"
            ? reader.openItems.map((item) => ({
                ...item,
                publicIssues: issuesFor(item, issues),
                issuesMeasuredAt: issues.measuredAt,
              }))
            : command === "section"
              ? (() => {
                  const heading = reader.headings.find((row) => row.id === args[0] || row.reference === args[0]);
                  if (!heading) return undefined;
                  const next = reader.headings.find((row) => row.line > heading.line && row.depth <= heading.depth);
                  return {
                    ...heading,
                    text: displayText(
                      recordedPaper()
                        .raw.split("\n")
                        .slice(heading.line - 1, next ? next.line - 1 : undefined)
                        .join("\n"),
                    ),
                  };
                })()
              : reader.headings;
    if (data === undefined) throw new Error("No matching parameter or section");
    const result = {
      sha: reader.sha,
      paperMeasuredAt: reader.measuredAt,
      source: reader.source,
      mode: values.live ? "live catalog" : "recorded",
      requests,
      warnings: reader.warnings,
      data,
    };
    console.log(
      displayText(
        values.json
          ? JSON.stringify(result, null, 2)
          : `Pinned ${reader.sha}\nPaper recorded ${reader.measuredAt}\n${reader.source}\n${result.mode}; ${requests} requests\n${reader.warnings.join("\n")}\n\n${JSON.stringify(data, null, 2)}`,
      ),
    );
  }
} catch (error) {
  console.error(displayText(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
