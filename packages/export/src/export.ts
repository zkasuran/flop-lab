// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { columnsFor, parsePlan, validateRow, type Plan, type Row } from "./schema";
import { encode } from "./encode";
import { type Page, type Reader } from "./source";

export type Manifest = {
  version: 1;
  plan: Plan;
  part: number;
  offset: number;
  limit: number;
  nextOffset: number;
  rowCount: number;
  exhausted: boolean;
  sha256: string;
  contentSha256: string;
  keys: string[];
  sources: string[];
  measuredAt: string[];
  queries: Page["captures"];
  writtenAt: string;
  requestsThisRun: number;
  columns: ReturnType<typeof columnsFor>;
};
/** Hash exact output bytes. This is not a signature. @example sha256(Buffer.from("data")) */
export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function contentHash(rows: Row[]) {
  return sha256(JSON.stringify(rows.map(({ measuredAt: _time, ...row }) => row)));
}
function rowKeys(plan: Plan, rows: Row[]) {
  const first = columnsFor(plan.dataset)[0]!.name;
  return rows.map((row) =>
    JSON.stringify(
      plan.dataset === "price-sources"
        ? [row.modelId, row.address]
        : plan.dataset === "snapshots"
          ? [row.snapshotId, row.observation]
          : [row[first]],
    ),
  );
}
function fileName(part: number, plan: Plan) {
  return `part-${String(part).padStart(6, "0")}.${plan.format}`;
}
function parseManifest(input: unknown, plan: Plan, part: number, offset: number): Manifest {
  if (!input || typeof input !== "object") throw new Error("Invalid manifest");
  const m = input as Manifest;
  if (
    m.version !== 1 ||
    JSON.stringify(parsePlan(m.plan)) !== JSON.stringify(plan) ||
    m.part !== part ||
    m.offset !== offset
  )
    throw new Error("Manifest query mismatch");
  for (const n of [m.nextOffset, m.rowCount, m.limit, m.requestsThisRun])
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid manifest count");
  if (
    m.rowCount > m.limit ||
    m.limit < 1 ||
    m.limit > plan.pageSize ||
    m.nextOffset !== offset + m.rowCount ||
    typeof m.exhausted !== "boolean" ||
    (!m.exhausted && m.rowCount === 0)
  )
    throw new Error("Invalid manifest paging");
  if (![m.sha256, m.contentSha256].every((h) => typeof h === "string" && /^[a-f0-9]{64}$/.test(h)))
    throw new Error("Invalid manifest digest");
  for (const list of [m.keys, m.sources, m.measuredAt])
    if (!Array.isArray(list) || list.some((s) => typeof s !== "string")) throw new Error("Invalid manifest metadata");
  if (
    m.keys.length !== m.rowCount ||
    !Array.isArray(m.queries) ||
    JSON.stringify(m.columns) !== JSON.stringify(columnsFor(plan.dataset))
  )
    throw new Error("Invalid manifest schema");
  return m;
}
async function atomic(path: string, bytes: Uint8Array | string, lock: string) {
  const temporary = join(lock, "pending");
  await writeFile(temporary, bytes, { flag: "wx" });
  await rename(temporary, path);
}
export type ExportResult = {
  status: "complete" | "partial";
  reason: string;
  rowCount: number;
  parts: number;
  requests: number;
  nextOffset: number;
  durationMs: number;
};

/** Write immutable dataset parts. Resume verifies hashes and rechecks the last page.
 * @example await exportDataset({ directory: "./rows", plan, reader: createReader(plan, 10) })
 */
export async function exportDataset(options: {
  directory: string;
  plan: Plan;
  reader: Reader;
  resume?: boolean;
}): Promise<ExportResult> {
  const { directory, reader } = options;
  const plan = parsePlan(options.plan);
  const started = performance.now();
  await mkdir(directory, { recursive: true });
  const lock = join(directory, ".export-lock");
  await mkdir(lock);
  let rowCount = 0,
    part = 0,
    offset = plan.offset;
  const result = (status: "complete" | "partial", reason: string): ExportResult => ({
    status,
    reason,
    rowCount,
    parts: part,
    requests: reader.requests,
    nextOffset: offset,
    durationMs: performance.now() - started,
  });
  try {
    const marker = join(directory, "export.json");
    if (options.resume) {
      const saved = parsePlan(JSON.parse(await readFile(marker, "utf8")));
      if (JSON.stringify(saved) !== JSON.stringify(plan)) throw new Error("Resume query differs from saved export");
    } else {
      if ((await readdir(directory)).some((name) => name !== ".export-lock"))
        throw new Error("Output directory must be empty. Use --resume for an existing export.");
      await writeFile(marker, JSON.stringify(plan) + "\n", { flag: "wx" });
    }
    const names = new Set(await readdir(directory));
    const seen = new Set<string>();
    let last: Manifest | undefined;
    while (names.has(fileName(part, plan) + ".manifest.json")) {
      const file = fileName(part, plan);
      const m = parseManifest(
        JSON.parse(await readFile(join(directory, file + ".manifest.json"), "utf8")),
        plan,
        part,
        offset,
      );
      if (sha256(await readFile(join(directory, file))) !== m.sha256) throw new Error(`SHA-256 mismatch: ${file}`);
      for (const key of m.keys) {
        if (seen.has(key)) throw new Error("Duplicate saved row");
        seen.add(key);
      }
      rowCount += m.rowCount;
      offset = m.nextOffset;
      part++;
      last = m;
      if (rowCount > plan.rows) throw new Error("Saved rows exceed requested range");
    }
    if ([...names].some((name) => /^part-/.test(name) && Number(name.slice(5, 11)) >= part))
      throw new Error("Uncommitted or noncontiguous part found. Preserve it outside this directory before resuming.");
    if (last?.exhausted || rowCount === plan.rows)
      return result("complete", last?.exhausted ? "Source reported end of range" : "Requested row count reached");
    if (last) {
      let check: Page;
      try {
        check = await reader.read(last.offset, last.limit);
      } catch (error) {
        return result("partial", `Resume check failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      const checkedRows = check.rows.map((r) => validateRow(plan.dataset, r));
      if (contentHash(checkedRows) !== last.contentSha256)
        throw new Error("Source changed at resume boundary. Start a new export directory.");
    }
    while (rowCount < plan.rows) {
      const limit = Math.min(plan.pageSize, plan.rows - rowCount);
      let page: Page;
      try {
        page = await reader.read(offset, limit);
      } catch (error) {
        return result("partial", error instanceof Error ? error.message : String(error));
      }
      const rows = page.rows.map((r) => validateRow(plan.dataset, r));
      if (rows.length > limit || page.consumed !== rows.length || (!page.exhausted && page.consumed === 0))
        throw new Error("Source made invalid paging progress");
      const keys = rowKeys(plan, rows);
      for (const key of keys) {
        if (seen.has(key)) throw new Error("Duplicate row across pages. Source order changed; start a new export.");
        seen.add(key);
      }
      const bytes = await encode(plan.dataset, plan.format, rows);
      const manifest: Manifest = {
        version: 1,
        plan,
        part,
        offset,
        limit,
        nextOffset: offset + page.consumed,
        rowCount: rows.length,
        exhausted: page.exhausted,
        sha256: sha256(bytes),
        contentSha256: contentHash(rows),
        keys,
        sources: [...new Set([...rows.map((r) => String(r.source)), ...page.captures.map((c) => c.source)])],
        measuredAt: [...new Set([...rows.map((r) => String(r.measuredAt)), ...page.captures.map((c) => c.measuredAt)])],
        queries: page.captures,
        writtenAt: new Date().toISOString(),
        requestsThisRun: reader.requests,
        columns: columnsFor(plan.dataset),
      };
      const path = join(directory, fileName(part, plan));
      await atomic(path, bytes, lock);
      await atomic(path + ".manifest.json", JSON.stringify(manifest, null, 2) + "\n", lock);
      rowCount += rows.length;
      offset = manifest.nextOffset;
      part++;
      if (page.exhausted) return result("complete", "Source reported end of range");
    }
    return result("complete", "Requested row count reached");
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
