// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { parseReport } from "./report";
import { array, object, text } from "./validation";
import type { RunReport } from "./types";

/** Read the split full-run archive without changing the historical site recording. @example await loadCoverageRecording() */
export async function loadCoverageRecording(): Promise<RunReport> {
  const root = new URL("../fixtures/coverage/", import.meta.url);
  const manifest = object(JSON.parse(await readFile(new URL("report.json", root), "utf8")));
  const results: unknown[] = [];
  for (const item of array(manifest.resultFiles)) {
    const name = text(item);
    if (!/^results-\d+\.json$/.test(name)) throw new Error("Invalid result filename");
    results.push(...array(JSON.parse(await readFile(new URL(name, root), "utf8"))));
  }
  return parseReport({ ...manifest, results });
}
