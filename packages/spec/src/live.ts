// SPDX-License-Identifier: Apache-2.0
import { McpClient } from "@flop-lab/mcp";
import { object, text, type Recording } from "./model";
import { runtimeFromRecordings } from "./runtime";

export const CACHE_TTL_MS = 60_000;

/** Create a bounded reader with one-minute memoisation, spacing and bounded retries. @example await createRuntimeReader()() */
export function createRuntimeReader(
  client = new McpClient({ retries: 1, minIntervalMs: 500, timeoutMs: 10_000 }),
  now = Date.now,
) {
  let cached: { expires: number; result: ReturnType<typeof read> } | undefined;
  async function read() {
    const records: Record<string, Recording> = {};
    const failures: string[] = [];
    async function call(key: string, tool: string, args: Record<string, unknown> = {}) {
      try {
        const answer = await client.callTool(tool, args);
        const record = {
          source: "https://mcp.flop.network/mcp",
          tool,
          args,
          raw: answer.raw,
          measuredAt: answer.measuredAt,
        };
        records[key] = record;
        return answer.value;
      } catch (error) {
        failures.push(`${key}: ${String(error)}`);
        return null;
      }
    }
    await call("catalog", "flop_knowledge_get", { id_or_path: "protocol-params" });
    await call("stats", "flop_get_stats");
    const schema = await call("schema", "flop_indexer_query", {
      query: '{ __type(name: "Transaction") { fields { name } } }',
    });
    try {
      const fields = object(object(schema).__type).fields;
      if (!Array.isArray(fields)) throw new Error("Missing Transaction schema");
      const names = fields.map((f) => text(object(f).name));
      if (!["hash", "blockNumber", "section", "method", "args", "success", "timestamp"].every((n) => names.includes(n)))
        throw new Error("Transaction schema changed");
      const response = await call("transactions", "flop_indexer_query", {
        query: "{ transactions(limit: 100, offset: 0) { hash blockNumber section method args success timestamp } }",
      });
      const rows = object(response).transactions;
      if (Array.isArray(rows) && rows.length) {
        const hash = text(object(rows[0]).hash);
        await call("transaction", "flop_indexer_query", {
          query:
            "query($hash: String!) { transaction(hash: $hash) { hash blockNumber section method args success timestamp } }",
          variables: { hash },
        });
      }
    } catch (error) {
      failures.push(`indexer: ${String(error)}`);
    }
    delete records.schema;
    const runtime = runtimeFromRecordings(records);
    runtime.warnings.push(...failures);
    return { runtime, records, requests: client.stats.requests };
  }
  return () => {
    if (!cached || now() >= cached.expires) cached = { expires: now() + CACHE_TTL_MS, result: read() };
    return cached.result;
  };
}
