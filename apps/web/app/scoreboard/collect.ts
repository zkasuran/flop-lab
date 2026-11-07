// SPDX-License-Identifier: Apache-2.0
import { setTimeout as delay } from "node:timers/promises";
import { Collector } from "../../../../packages/scoreboard/src/collector";
import { publicFetch } from "../../lib/security/transport";

/** Bound the entire collection, including retry waits. Example: await collectSnapshot(). */
export async function collectSnapshot(fetcher: typeof fetch = publicFetch, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const collector = new Collector({
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
    return await collector.snapshot();
  } finally {
    clearTimeout(timer);
  }
}
