// SPDX-License-Identifier: Apache-2.0
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseHistory, parseRun, type Run } from "./schema";
import { uniqueRuns } from "./history";

async function readOptional(path: string): Promise<Run[]> {
  try {
    return parseHistory(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Append one capture to its UTC day and update the last 24 rounds. Caller must serialize writers. @example await appendRun("./archive", run) */
export async function appendRun(root: string, value: Run): Promise<string> {
  const run = parseRun(value);
  const relative = `status/${run.startedAt.slice(0, 10).replaceAll("-", "/")}.jsonl`;
  const path = join(root, relative);
  const recentPath = join(root, "status/recent.jsonl");
  const existing = await readOptional(path);
  const merged = uniqueRuns([...existing, run]);
  const recent = uniqueRuns([...(await readOptional(recentPath)), ...merged]).slice(-24);
  const text = recent.map((r) => JSON.stringify(r)).join("\n") + "\n";
  if (Buffer.byteLength(text) > 196_608) throw new Error("Recent archive exceeds public response limit");
  await mkdir(dirname(path), { recursive: true });
  if (merged.length > existing.length) {
    const needsNewline = existing.length > 0 && !(await readFile(path, "utf8")).endsWith("\n");
    await appendFile(path, (needsNewline ? "\n" : "") + JSON.stringify(run) + "\n", "utf8");
  }
  await writeFile(`${recentPath}.tmp`, text, "utf8");
  await rename(`${recentPath}.tmp`, recentPath);
  return relative;
}
