// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { McpClient, DEFAULT_URL, readIndexer, parseIndexerData } from "@flop-lab/mcp";
// Import the shared validators directly so recorded previews do not load recorder runners.
import { parseGateway } from "../../models/src/schema";
import { parseSnapshot } from "../../recorder/src/schema";
import { readIndex } from "../../recorder/src/store";
import { columnsFor, validateRow, type Dataset, type Plan, type Row } from "./schema";

export const GATEWAY = "https://api.flop.network/v1/models";
export type Capture = {
  dataset: Dataset;
  source: string;
  measuredAt: string;
  query: string;
  variables: Record<string, unknown>;
  raw: string;
};
export type Page = { rows: Row[]; consumed: number; exhausted: boolean; captures: Omit<Capture, "raw">[] };
export interface Reader {
  read(offset: number, limit: number): Promise<Page>;
  readonly requests: number;
}
const entities = {
  settlements: "settlementPrices",
  channels: "computeChannels",
  blocks: "blocks",
  transactions: "transactions",
  proofs: "pouiProofs",
  accounts: "account",
} as const;

/** Parse a dated response through the shared schemas. @example await rowsFromCapture(capture) */
export async function rowsFromCapture(c: Capture): Promise<{ rows: Row[]; exhausted: boolean }> {
  const value: unknown = JSON.parse(c.raw);
  let values: Record<string, unknown>[];
  let exhausted = true;
  if (c.dataset === "models" || c.dataset === "price-sources") {
    const models = parseGateway(value);
    values =
      c.dataset === "models"
        ? models.map((m) => ({
            modelId: m.id,
            registryName: m.registryName,
            registryVersion: m.registryVersion,
            promptPrice: m.prompt,
            completionPrice: m.completion,
          }))
        : models.flatMap((m) => m.sources.map((s) => ({ modelId: m.id, ...s })));
  } else if (c.dataset === "snapshots") {
    const s = await parseSnapshot(value);
    values = Object.entries(s.observations).map(([observation, o]) => ({
      snapshotId: s.id,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      observation,
      status: o.status,
      valueJson: JSON.stringify(o.value),
      error: o.error,
      source: o.source,
      measuredAt: o.measuredAt,
    }));
  } else {
    const result = parseIndexerData(entities[c.dataset], value);
    if (c.dataset === "accounts") {
      const row = result as ReturnType<typeof parseIndexerData<"account">>;
      values = [
        {
          ...Object.fromEntries(
            columnsFor("accounts")
              .filter((col) => !["source", "measuredAt"].includes(col.name))
              .map((col) => [col.name, null]),
          ),
          ...row,
          address: row?.address ?? c.variables.address,
          found: row !== null,
        },
      ];
    } else if (result && !Array.isArray(result) && "pagination" in result) {
      const limit = c.variables.limit,
        offset = c.variables.offset;
      if (
        result.pagination.offset !== offset ||
        result.pagination.limit !== limit ||
        (result.pagination.hasMore && !result.data.length)
      )
        throw new Error("Inconsistent pagination");
      values = result.data;
      exhausted = !result.pagination.hasMore;
    } else {
      if (!Array.isArray(result)) throw new Error("Expected dataset rows");
      values = result;
      exhausted = values.length < Number(c.variables.limit);
    }
  }
  return {
    rows: values.map((r) => validateRow(c.dataset, { source: c.source, measuredAt: c.measuredAt, ...r })),
    exhausted,
  };
}

/** Create a read-only source with a budget that counts every HTTP attempt. @example createReader(plan, 10) */
export function createReader(
  plan: Plan,
  maxRequests: number,
  options: { fetch?: typeof fetch; capture?: (c: Capture) => Promise<void> } = {},
): Reader {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 0 || maxRequests > 10_000)
    throw new Error("Invalid request budget");
  let requests = 0;
  const transport: typeof fetch = async (url, init) => {
    if (requests >= maxRequests) throw new Error("Request budget exhausted");
    requests++;
    const response = await (options.fetch ?? fetch)(url, { ...init, signal: AbortSignal.timeout(30_000) });
    if (!response.body) throw new Error("Empty response body");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) throw new Error("Response exceeds byte limit");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
  };
  const client = new McpClient({ fetch: transport, retries: 1, minIntervalMs: 500 });
  let cached: { at: number; capture: Capture; rows: Row[] } | undefined;
  let snapshots: Row[] | undefined;
  const snapshotCaptures: Omit<Capture, "raw">[] = [];
  async function finish(c: Capture) {
    const parsed = await rowsFromCapture(c);
    await options.capture?.(c);
    const { raw: _raw, ...meta } = c;
    return { ...parsed, captures: [meta] };
  }
  return {
    get requests() {
      return requests;
    },
    async read(offset, limit) {
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new Error("Invalid page range");
      if (plan.dataset === "snapshots") {
        if (!snapshots) {
          snapshots = [];
          const index = await readIndex(plan.archive!);
          if (index.entries.length === 0)
            snapshotCaptures.push({
              dataset: "snapshots",
              source: join(plan.archive!, "index.json"),
              measuredAt: new Date().toISOString(),
              query: "local recorder index (empty or absent)",
              variables: {},
            });
          for (const entry of index.entries) {
            const path = join(plan.archive!, entry.path);
            const raw = await readFile(path, "utf8");
            if (Buffer.byteLength(raw) > 100_000) throw new Error("Snapshot exceeds byte limit");
            const c: Capture = {
              dataset: "snapshots",
              source: path,
              measuredAt: entry.measuredAt,
              query: "local recorder snapshot",
              variables: { id: entry.id },
              raw,
            };
            const page = await finish(c);
            if (page.rows.some((r) => r.snapshotId !== entry.id)) throw new Error("Snapshot index digest mismatch");
            snapshots.push(...page.rows);
            snapshotCaptures.push(...page.captures);
          }
        }
        return {
          rows: snapshots.slice(offset, offset + limit),
          consumed: Math.min(limit, Math.max(0, snapshots.length - offset)),
          exhausted: offset + limit >= snapshots.length,
          captures: snapshotCaptures,
        };
      }
      if (plan.dataset === "models" || plan.dataset === "price-sources") {
        if (!cached || Date.now() - cached.at >= 30_000) {
          let response: Response | undefined;
          for (let attempt = 0; attempt < 2; attempt++) {
            response = await transport(GATEWAY, { headers: { "User-Agent": "flop-lab-export/0.1" } });
            if (response.ok || (response.status !== 429 && response.status < 500)) break;
            const delay = Math.max(500, Math.min(30_000, Number(response.headers.get("retry-after")) * 1000 || 0));
            if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, delay));
          }
          if (!response?.ok) throw new Error(`Gateway HTTP ${response?.status}`);
          const capture: Capture = {
            dataset: plan.dataset,
            source: GATEWAY,
            measuredAt: new Date().toISOString(),
            query: "GET /v1/models",
            variables: {},
            raw: await response.text(),
          };
          const parsed = await finish(capture);
          cached = { at: Date.now(), capture, rows: parsed.rows };
        }
        const { raw: _raw, ...meta } = cached.capture;
        const rows = cached.rows.slice(offset, offset + limit);
        return { rows, consumed: rows.length, exhausted: offset + limit >= cached.rows.length, captures: [meta] };
      }
      const entity = entities[plan.dataset];
      if (entity === "account" && offset >= plan.addresses.length)
        return {
          rows: [],
          consumed: 0,
          exhausted: true,
          captures: [
            {
              dataset: "accounts",
              source: "local supplied address list",
              measuredAt: new Date().toISOString(),
              query: "supplied address range exhausted; no network lookup",
              variables: { offset, addressCount: plan.addresses.length },
            },
          ],
        };
      const result =
        entity === "account"
          ? await readIndexer(client, entity, { address: plan.addresses[offset]! })
          : await readIndexer(client, entity, { offset, limit });
      const c: Capture = {
        dataset: plan.dataset,
        source: DEFAULT_URL,
        measuredAt: result.measuredAt,
        query: result.query,
        variables: result.variables,
        raw: result.raw,
      };
      const page = await finish(c);
      return {
        ...page,
        consumed: page.rows.length,
        exhausted: entity === "account" ? offset + 1 >= plan.addresses.length : page.exhausted,
      };
    },
  };
}
