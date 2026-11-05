// SPDX-License-Identifier: Apache-2.0
export const MCP_URL = "https://mcp.flop.network/mcp";
export const MODELS_URL = "https://api.flop.network/v1/models";
export const TTL_MS = 30_000;
export type Stats = { block: number; accounts: number };
export type Settlement = { channel: string; miner: string; at: number; block: number };
export type Observation<T> = {
  value: T | null;
  measuredAt: string | null;
  source: string;
  stale: boolean;
  error: string | null;
};
export type Snapshot = {
  stats: Observation<Stats>;
  settlements: Observation<Settlement[]>;
  miners: Observation<string[]>;
  renderedAt: string;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Expected a nonnegative safe integer");
  return value;
}
function address(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{46,50}$/.test(value))
    throw new Error("Invalid address shape");
  return value;
}
/** Project validated MCP stats into display fields. Example: parseStats({ stats: result.value }). */
export function parseStats(input: unknown): Stats {
  const stats = object(object(input).stats);
  return { block: integer(stats.latestBlockNumber), accounts: integer(stats.totalAccounts) };
}
/** Validate and order the returned page, not the entire chain. Example: parseSettlements(payload). */
export function parseSettlements(input: unknown): Settlement[] {
  const data = object(input).data;
  if (!Array.isArray(data) || data.length > 100) throw new Error("Invalid settlement page");
  return data
    .map((value) => {
      const row = object(value);
      if (typeof row.channelId !== "string" || !/^0x[\da-f]{64}$/i.test(row.channelId))
        throw new Error("Invalid channel identifier");
      const at = integer(row.settledAt);
      if (!Number.isFinite(new Date(at).getTime())) throw new Error("Invalid settlement time");
      return { channel: row.channelId, miner: address(row.miner), at, block: integer(row.settledBlock) };
    })
    .sort((a, b) => b.at - a.at);
}
/** Count distinct addresses in all returned price sources. Example: parseMiners(models). */
export function parseMiners(input: unknown): string[] {
  const data = object(input).data;
  if (!Array.isArray(data) || data.length > 1000) throw new Error("Invalid model list");
  const miners = new Set<string>();
  for (const value of data) {
    const sources = object(object(value)["x-flop"]).price_sources;
    if (!Array.isArray(sources) || sources.length > 1000) throw new Error("Invalid price sources");
    for (const source of sources) miners.add(address(object(source).miner_address));
  }
  return [...miners].sort();
}

export class FetchFailure extends Error {
  constructor(
    message: string,
    readonly retryAt = 0,
  ) {
    super(message);
  }
}

/** Retain the last valid observation with a TTL and coalesced requests. Example: const read = observationCache(load, source); await read(); */
export function observationCache<T>(
  load: () => Promise<T>,
  source: string,
  seed?: { value: T; measuredAt: string },
  now = Date.now,
) {
  let last = seed;
  let nextAttempt = 0;
  let failures = 0;
  let error: string | null = null;
  let pending: Promise<void> | undefined;
  return async (): Promise<Observation<T>> => {
    if (now() >= nextAttempt) {
      pending ??= (async () => {
        try {
          const value = await load();
          last = { value, measuredAt: new Date(now()).toISOString() };
          error = null;
          failures = 0;
          nextAttempt = now() + TTL_MS;
        } catch (cause) {
          failures += 1;
          error = cause instanceof Error ? cause.message : "Source unavailable";
          nextAttempt = Math.max(
            now() + Math.min(TTL_MS * 2 ** (failures - 1), 300_000),
            cause instanceof FetchFailure ? cause.retryAt : 0,
          );
        }
      })();
      await pending;
      pending = undefined;
    }
    return {
      value: last?.value ?? null,
      measuredAt: last?.measuredAt ?? null,
      source,
      stale: error !== null || !last || now() - Date.parse(last.measuredAt) > TTL_MS,
      error,
    };
  };
}

/** Fetch one bounded public HTTP response without retries. Example: await boundedFetch(MODELS_URL). */
export async function boundedFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return new Response("", { status: response.status, headers: response.headers });
  }
  if (!response.body) throw new Error("Empty response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 200_000) throw new Error("Response exceeds the size limit");
      raw += decoder.decode(value, { stream: true });
    }
    return new Response(raw + decoder.decode(), { status: response.status, headers: response.headers });
  } finally {
    await reader.cancel();
  }
}

/** Read Retry-After as a deadline. Example: retryDeadline(response.headers). */
export function retryDeadline(headers: Headers): number {
  const retry = headers.get("retry-after");
  const deadline = retry && /^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry ?? "");
  return Number.isFinite(deadline) ? deadline : 0;
}

/** Read the keyless model list as text. Example: await readPublic(MODELS_URL). */
export async function readPublic(url: string): Promise<string> {
  const response = await boundedFetch(url);
  if (!response.ok) throw new FetchFailure(`HTTP ${response.status}`, retryDeadline(response.headers));
  return response.text();
}
