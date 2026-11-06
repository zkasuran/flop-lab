// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { object, parseCapture, type Capture } from "./schema";
async function json(path: string, limit: number): Promise<unknown> {
  if ((await stat(path)).size > limit) throw new Error("Recording file exceeds size limit");
  const raw = await readFile(path, "utf8");
  if (Buffer.byteLength(raw) > limit) throw new Error("Recording file exceeds size limit");
  return JSON.parse(raw) as unknown;
}
/** Load a bounded manifest and its local response pages. @example await loadCapture("./recording") */
export async function loadCapture(dir: string): Promise<Capture> {
  const manifest = object(await json(join(dir, "manifest.json"), 10_000));
  if (
    !Array.isArray(manifest.pages) ||
    manifest.pages.length > 41 ||
    manifest.pages.some((p) => typeof p !== "string" || !/^page-\d+\.json$/.test(p))
  )
    throw new Error("Invalid page manifest");
  const observations = await Promise.all((manifest.pages as string[]).map((p) => json(join(dir, p), 200_000)));
  return parseCapture({ ...manifest, observations });
}
/** Save original tool text in separate bounded files. Existing recordings are not overwritten.
 * @example await saveCapture("./new-recording", capture)
 */
export async function saveCapture(dir: string, input: Capture): Promise<void> {
  const capture = parseCapture(input);
  await mkdir(dir, { recursive: true });
  const { observations, ...meta } = capture;
  const pages = observations.map((_, i) => `page-${i}.json`);
  for (const [i, o] of observations.entries()) {
    const text = JSON.stringify(o)
      .replaceAll(String.fromCharCode(8212), "\\u2014")
      .replaceAll(String.fromCharCode(8211), "\\u2013");
    if (Buffer.byteLength(text) >= 200_000) throw new Error("Recorded page exceeds 200 KB");
    await writeFile(join(dir, pages[i]!), text + "\n", { flag: "wx" });
  }
  await writeFile(join(dir, "manifest.json"), JSON.stringify({ ...meta, pages }, null, 2) + "\n", { flag: "wx" });
}
