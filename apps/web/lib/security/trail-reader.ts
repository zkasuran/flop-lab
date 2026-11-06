// SPDX-License-Identifier: Apache-2.0
import type { Observation, Reader } from "../../../../packages/did/src/trail";
import { allowedSource, publicFetch } from "./transport";

/** Bounded web-only DID cache. Never creates files from visitor-selected fingerprints. @example createTrailReader()(source) */
export function createTrailReader(transport: typeof fetch = publicFetch, now = Date.now): Reader {
  const cache = new Map<string, { until: number; value: Promise<Observation> }>();
  let reset = 0;
  let used = 0;
  return async (source) => {
    allowedSource(source);
    for (const [key, entry] of cache) if (entry.until <= now()) cache.delete(key);
    const hit = cache.get(source);
    if (hit) return hit.value;
    if (now() >= reset) {
      used = 0;
      reset = now() + 3_600_000;
    }
    if (used >= 30 || cache.size >= 64) throw new Error("Public trail read budget reached");
    used++;
    const entry: { until: number; value: Promise<Observation> } = {
      until: Infinity,
      value: Promise.resolve()
        .then(async () => {
          const response = await transport(source, {
            headers: { "User-Agent": "flop-lab-web-did/0.1 (read-only, cached)" },
          });
          const raw = await response.text();
          return { source, measuredAt: new Date(now()).toISOString(), status: response.status, raw };
        })
        .finally(() => {
          entry.until = now() + 3_600_000;
        }),
    };
    cache.set(source, entry);
    return entry.value;
  };
}
