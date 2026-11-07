// SPDX-License-Identifier: Apache-2.0
import { setTimeout as delay } from "node:timers/promises";
import { McpClient } from "../../../../packages/mcp/src/index";
import { publicFetch } from "../../lib/security/transport";

/** Cancel the whole operation, including body reads and backoff. Example: await withClient(client => collectTape(client)). */
export async function withClient<T>(
  run: (client: McpClient) => Promise<T>,
  fetcher: typeof fetch = publicFetch,
  timeoutMs = 8_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const client = new McpClient({
    retries: 1,
    minIntervalMs: 300,
    timeoutMs: 3_000,
    fetch: async (url, init) => {
      controller.signal.throwIfAborted();
      return fetcher(url, {
        ...init,
        signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal,
      });
    },
    sleep: async (ms) => {
      await delay(ms, undefined, { signal: controller.signal });
    },
  });
  try {
    return await run(client);
  } finally {
    clearTimeout(timer);
  }
}
