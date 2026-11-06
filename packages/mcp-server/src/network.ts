// SPDX-License-Identifier: Apache-2.0
import { AsyncLocalStorage } from "node:async_hooks";

const context = new AsyncLocalStorage<{ attempts: number; deadline: number }>();
const MAX_ATTEMPTS = 40;
const MAX_BODY_BYTES = 196608;

/** Physical HTTP attempts in the current operation. @example requestCount() */
export function requestCount(): number {
  return context.getStore()?.attempts ?? 0;
}

/** Apply a hard per-call budget across all existing package transports. @example await withNetworkBudget(() => tool.run(args)) */
export function withNetworkBudget<T>(run: () => Promise<T>): Promise<T> {
  return context.run({ attempts: 0, deadline: Date.now() + 60000 }, run);
}

/** A bounded fetch boundary, not an MCP client. Package clients retain parsing and retry policy. @example new McpClient({fetch: boundedFetch}) */
export const boundedFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const allowed =
    url.href === "https://mcp.flop.network/mcp" ||
    url.href === "https://api.flop.network/v1/models" ||
    (url.origin === "https://explorer.devnet.flop.network" && url.pathname.startsWith("/api/"));
  if (!allowed || url.username || url.password) throw new Error("Endpoint outside suite read-only allowlist");
  const budget = context.getStore();
  if (!budget) throw new Error("Network request outside tool budget");
  if (budget.attempts >= MAX_ATTEMPTS || Date.now() >= budget.deadline)
    throw new Error("Suite network budget exhausted");
  budget.attempts++;
  const timeout = AbortSignal.timeout(Math.max(1, Math.min(8000, budget.deadline - Date.now())));
  const response = await fetch(input, {
    ...init,
    redirect: "error",
    signal: init?.signal ? AbortSignal.any([timeout, init.signal]) : timeout,
  });
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_BODY_BYTES) throw new Error("Suite response exceeds 192 KiB");
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
  return new Response(response.status === 204 || response.status === 304 ? null : Buffer.concat(chunks), {
    status: response.status,
    headers: response.headers,
  });
};
