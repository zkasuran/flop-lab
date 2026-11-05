// SPDX-License-Identifier: Apache-2.0
import { classify, Explorer, SearchBudget } from "../../../../packages/explorer/src/index";
import { recordedExploration } from "../../../../packages/explorer/src/recorded";
import type { Kind } from "../../../../packages/explorer/src/types";

/** Shared service lifetime bounds the cache, queue and visitor budget to one server instance.
 * @example const handle = createSearchService(); await handle(new Request(url))
 */
export function createSearchService(explorer: Pick<Explorer, "search"> = new Explorer(), budget = new SearchBudget()) {
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
      const cookie = /(?:^|;\s*)flop_explorer=([0-9a-f-]{36})(?:;|$)/.exec(request.headers.get("cookie") ?? "")?.[1];
      const visitor = cookie ?? crypto.randomUUID();
      if (!cookie)
        headers.set(
          "Set-Cookie",
          `flop_explorer=${visitor}; HttpOnly; SameSite=Lax; Path=/explorer; Max-Age=3600${url.protocol === "https:" ? "; Secure" : ""}`,
        );
      const admission = budget.take(visitor);
      if (!admission.allowed) {
        headers.set("Retry-After", String(admission.retryAfter));
        return Response.json(
          { error: `Search budget reached. Retry after ${admission.retryAfter} seconds.` },
          { status: 429, headers },
        );
      }
      return Response.json(await explorer.search(input), { headers });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Search unavailable" },
        { status: 400, headers },
      );
    }
  };
}
