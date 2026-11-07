// SPDX-License-Identifier: Apache-2.0
import { classify, Explorer, SearchBudget } from "../../../../packages/explorer/src/index";
import { recordedExploration } from "../../../../packages/explorer/src/recorded";
import type { Kind } from "../../../../packages/explorer/src/types";
import { McpClient } from "@flop-lab/mcp";
import { visitorKey } from "../../lib/security/admission";
import { failure } from "../../lib/security/policy";
import { publicFetch, safeJson, withPublicOperation } from "../../lib/security/transport";

/** Shared service lifetime bounds the cache, queue and visitor budget to one server instance.
 * @example const handle = createSearchService(); await handle(new Request(url))
 */
export function createSearchService(
  explorer: Pick<Explorer, "search"> = new Explorer(new McpClient({ fetch: publicFetch, retries: 0, timeoutMs: 8000 })),
  budget = new SearchBudget(),
) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const headers = new Headers({ "Cache-Control": "private, no-store" });
    try {
      const recording = url.searchParams.get("recorded");
      if (recording !== null) {
        if (!["block", "transaction", "account", "channel", "htlc"].includes(recording))
          return Response.json({ error: "Unknown recording" }, { status: 400, headers });
        return Response.json(recordedExploration(recording as Kind), { headers });
      }
      const input = url.searchParams.get("q") ?? "";
      classify(input);
      const visitor = visitorKey(request);
      const admission = budget.take(visitor);
      if (!admission.allowed) {
        headers.set("Retry-After", String(admission.retryAfter));
        return Response.json(
          { error: `Search budget reached. Retry after ${admission.retryAfter} seconds.` },
          { status: 429, headers },
        );
      }
      return withPublicOperation(async () => {
        const result = await explorer.search(input);
        const clean = <T extends { error: string | null }>(entry: T): T => ({
          ...entry,
          error: entry.error ? "Public observation unavailable" : null,
        });
        return safeJson(
          {
            ...result,
            lookups: result.lookups.map(clean),
            entities: result.entities.map((entity) => ({ ...entity, evidence: entity.evidence.map(clean) })),
          },
          { headers },
        );
      });
    } catch {
      return failure(400);
    }
  };
}
