// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parquetReadObjects, parquetMetadata } from "hyparquet";
import {
  columnsFor,
  createReader,
  datasets,
  encode,
  exportDataset,
  parsePlan,
  recordedReader,
  rowsFromCapture,
  sha256,
  validateRow,
  type Capture,
  type Plan,
  type Reader,
  type Row,
} from "../src/index";
import blockCapture from "../fixtures/blocks.json";
import settlementCapture from "../fixtures/settlements.json";

const directories: string[] = [];
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), "flop-export-"));
  directories.push(dir);
  return dir;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
const plan = (extra: Partial<Plan> = {}): Plan => ({
  version: 1,
  dataset: "blocks",
  format: "ndjson",
  offset: 0,
  rows: 5,
  pageSize: 2,
  addresses: [],
  archive: null,
  recorded: true,
  ...extra,
});
async function limitedReader(pages: number): Promise<Reader> {
  const original = await recordedReader("blocks");
  let count = 0;
  return {
    get requests() {
      return count;
    },
    async read(offset, limit) {
      if (count >= pages) throw new Error("Request budget exhausted");
      count++;
      return original.read(offset, limit);
    },
  };
}

describe("recorded schemas and formats", () => {
  it.each(datasets)("round-trips real %s rows through NDJSON and Parquet", async (dataset) => {
    const page = await (await recordedReader(dataset)).read(0, 100);
    expect(page.captures.length).toBeGreaterThan(0);
    const ndjson = Buffer.from(await encode(dataset, "ndjson", page.rows)).toString();
    expect(
      ndjson.trim()
        ? ndjson
            .trim()
            .split("\n")
            .map((s) => JSON.parse(s) as unknown)
        : [],
    ).toEqual(page.rows);
    const bytes = await encode(dataset, "parquet", page.rows);
    const file = Uint8Array.from(bytes).buffer;
    const decoded: Record<string, unknown>[] = await parquetReadObjects({ file });
    const normalized = decoded.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([key, value]) => [key, typeof value === "bigint" ? Number(value) : value]),
      ),
    );
    expect(normalized).toEqual(page.rows);
    expect(
      parquetMetadata(file)
        .schema.slice(1)
        .map((c) => c.name),
    ).toEqual(columnsFor(dataset).map((c) => c.name));
  });
  it.each(datasets)("writes empty %s with stable columns", async (dataset) => {
    const file = Uint8Array.from(await encode(dataset, "parquet", [])).buffer;
    expect(await parquetReadObjects({ file })).toEqual([]);
    expect(Buffer.from(await encode(dataset, "csv", [])).toString()).toBe(
      columnsFor(dataset)
        .map((c) => c.name)
        .join(",") + "\r\n",
    );
  });
  it("escapes CSV quotes, newlines and formula-leading strings while keeping exact amounts", async () => {
    const page = await (await recordedReader("settlements")).read(0, 1);
    const row = {
      ...page.rows[0]!,
      agent: '=HYPERLINK("x")',
      miner: "a,\nb",
      escrow: "123456789012345678901234567890",
    };
    const csv = Buffer.from(await encode("settlements", "csv", [row])).toString();
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('"a,\nb"');
    expect(csv).toContain('"123456789012345678901234567890"');
    const roundtrip = await parquetReadObjects({
      file: Uint8Array.from(await encode("settlements", "parquet", [row])).buffer,
    });
    expect(roundtrip[0]?.escrow).toBe(row.escrow);
  });
  it("rejects unsafe integers, wrong types, missing timestamps and malformed boundary data", async () => {
    const row = (await (await recordedReader("blocks")).read(0, 1)).rows[0]!;
    for (const patch of [
      { number: Number.MAX_SAFE_INTEGER + 1 },
      { number: "12" },
      { timestamp: Infinity },
      { hash: null },
      { measuredAt: "bad" },
    ])
      expect(() => validateRow("blocks", { ...row, ...patch })).toThrow();
    const capture = { ...blockCapture[0]!, dataset: "blocks" } as Capture;
    await expect(rowsFromCapture({ ...capture, raw: '{"blocks":null}' })).rejects.toThrow();
    await expect(rowsFromCapture({ ...capture, raw: '{"errors":[],"blocks":[]}' })).rejects.toThrow();
    const settlement = { ...settlementCapture[0]!, dataset: "settlements" } as Capture;
    const body = JSON.parse(settlement.raw) as { settlementPrices: { pagination: { offset: number } } };
    body.settlementPrices.pagination.offset = 999;
    await expect(rowsFromCapture({ ...settlement, raw: JSON.stringify(body) })).rejects.toThrow("pagination");
  });
});

describe("bounded resumable parts", () => {
  it("dates and sources an empty local archive without HTTP", async () => {
    const p = plan({ dataset: "snapshots", archive: await directory(), recorded: false });
    const reader = createReader(p, 0);
    const page = await reader.read(0, 2);
    expect(page.rows).toEqual([]);
    expect(page.captures[0]?.source).toBe(join(p.archive!, "index.json"));
    expect(Number.isFinite(Date.parse(page.captures[0]!.measuredAt))).toBe(true);
    expect(reader.requests).toBe(0);
    await expect(reader.read(-1, 2)).rejects.toThrow("range");
  });
  it("resumes a partial run without changing saved bytes or duplicating rows", async () => {
    const dir = await directory();
    const first = await exportDataset({ directory: dir, plan: plan(), reader: await limitedReader(1) });
    expect(first).toMatchObject({ status: "partial", rowCount: 2, parts: 1, nextOffset: 2 });
    const before = await readFile(join(dir, "part-000000.ndjson"));
    const resumed = await exportDataset({ directory: dir, plan: plan(), reader: await limitedReader(3), resume: true });
    expect(resumed).toMatchObject({ status: "complete", rowCount: 5, parts: 3, requests: 3, nextOffset: 5 });
    expect(await readFile(join(dir, "part-000000.ndjson"))).toEqual(before);
    const rows: Row[] = [];
    for (let i = 0; i < 3; i++) {
      const name = `part-${String(i).padStart(6, "0")}.ndjson`;
      const bytes = await readFile(join(dir, name));
      rows.push(
        ...bytes
          .toString()
          .trim()
          .split("\n")
          .map((s) => JSON.parse(s) as Row),
      );
      const manifest = JSON.parse(await readFile(join(dir, name + ".manifest.json"), "utf8")) as {
        sha256: string;
        sources: string[];
        measuredAt: string[];
        queries: unknown[];
      };
      expect(manifest.sha256).toBe(sha256(bytes));
      expect(manifest.sources).toContain("https://mcp.flop.network/mcp");
      expect(manifest.measuredAt).toEqual([blockCapture[0]!.measuredAt]);
      expect(manifest.queries.length).toBeGreaterThan(0);
    }
    expect(rows).toEqual((await (await recordedReader("blocks")).read(0, 5)).rows);
  });
  it("rejects tampered bytes before making any resume requests", async () => {
    const dir = await directory();
    await exportDataset({ directory: dir, plan: plan(), reader: await limitedReader(1) });
    await writeFile(join(dir, "part-000000.ndjson"), "tampered\n");
    const reader = await limitedReader(3);
    await expect(exportDataset({ directory: dir, plan: plan(), reader, resume: true })).rejects.toThrow(
      "SHA-256 mismatch",
    );
    expect(reader.requests).toBe(0);
  });
  it("rejects a moved source boundary and preserves committed data", async () => {
    const dir = await directory();
    await exportDataset({ directory: dir, plan: plan(), reader: await limitedReader(1) });
    const base = await recordedReader("blocks");
    const reader: Reader = {
      requests: 0,
      async read(offset, limit) {
        const page = await base.read(offset, limit);
        return { ...page, rows: page.rows.map((r) => ({ ...r, hash: "different" })) };
      },
    };
    await expect(exportDataset({ directory: dir, plan: plan(), reader, resume: true })).rejects.toThrow(
      "Source changed",
    );
    expect((await readdir(dir)).filter((p) => p.endsWith(".ndjson"))).toHaveLength(1);
  });
  it("rejects changed queries, orphan parts and existing directories", async () => {
    const dir = await directory();
    await exportDataset({ directory: dir, plan: plan(), reader: await limitedReader(1) });
    await expect(
      exportDataset({ directory: dir, plan: plan({ rows: 6 }), reader: await limitedReader(1), resume: true }),
    ).rejects.toThrow("differs");
    await expect(exportDataset({ directory: dir, plan: plan(), reader: await limitedReader(1) })).rejects.toThrow(
      "empty",
    );
    await writeFile(join(dir, "part-000001.ndjson"), "uncommitted");
    await expect(
      exportDataset({ directory: dir, plan: plan(), reader: await limitedReader(1), resume: true }),
    ).rejects.toThrow("Uncommitted");
  });
  it("rejects duplicate rows and pages with no forward progress", async () => {
    const base = await recordedReader("blocks");
    const repeating: Reader = { requests: 0, read: (_offset, limit) => base.read(0, limit) };
    await expect(exportDataset({ directory: await directory(), plan: plan(), reader: repeating })).rejects.toThrow(
      "Duplicate row",
    );
    const stalled: Reader = {
      requests: 0,
      async read() {
        return { rows: [], consumed: 0, exhausted: false, captures: [] };
      },
    };
    await expect(exportDataset({ directory: await directory(), plan: plan(), reader: stalled })).rejects.toThrow(
      "paging",
    );
  });
  it("preserves empty source evidence in a manifest and resumes complete output offline", async () => {
    const dir = await directory(),
      p = plan({ dataset: "proofs", format: "parquet" });
    expect(await exportDataset({ directory: dir, plan: p, reader: await recordedReader("proofs") })).toMatchObject({
      status: "complete",
      rowCount: 0,
      parts: 1,
    });
    expect(
      await exportDataset({ directory: dir, plan: p, reader: await limitedReader(0), resume: true }),
    ).toMatchObject({ status: "complete", rowCount: 0, requests: 0 });
  });
  it("validates account scope and numeric budgets before fetching", () => {
    expect(() => parsePlan(plan({ dataset: "accounts", recorded: false }))).toThrow("no account list");
    for (const rows of [0, -1, Infinity, 1.5, 1_000_001]) expect(() => parsePlan(plan({ rows }))).toThrow();
    expect(() => createReader(plan(), -1)).toThrow("budget");
  });
  it("counts HTTP retries against the hard budget", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("unavailable", { status: 503 }));
    const reader = createReader(plan({ recorded: false }), 1, { fetch: fetcher });
    await expect(reader.read(0, 2)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reader.requests).toBe(1);
  });
  it("replays the real MCP payload and limits bodies", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number };
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: { content: [{ type: "text", text: blockCapture[0]!.raw }] },
        }),
      );
    });
    const reader = createReader(plan({ recorded: false }), 1, { fetch: fetcher });
    expect((await reader.read(0, 5)).rows).toEqual(
      (await (await recordedReader("blocks")).read(0, 5)).rows.map((r) => ({ ...r, measuredAt: expect.any(String) })),
    );
    const huge = createReader(plan(), 1, { fetch: async () => new Response("x".repeat(2_000_001)) });
    await expect(huge.read(0, 2)).rejects.toThrow();
    expect(huge.requests).toBe(1);
  });
});
