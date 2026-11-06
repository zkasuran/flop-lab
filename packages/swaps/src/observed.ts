// SPDX-License-Identifier: Apache-2.0
import { McpClient, DEFAULT_URL } from "@flop-lab/mcp";
import { normalizeHashLock } from "./hash";
import swapFixture from "../fixtures/swaps.json";
import htlcFixture from "../fixtures/htlcs.json";
import checkFixture from "../fixtures/check.json";

export const HTLC_QUERY = "{ htlcs(limit: 20, offset: 0) { hashLock timeout status amount sender recipient } }";
export interface HtlcRow {
  hashLock: string;
  timeout: number | null;
  status: string | null;
  amount: string | null;
  sender: string | null;
  recipient: string | null;
}
export interface SwapPage {
  page: number;
  total: number;
  rows: Record<string, unknown>[];
}
export interface Observation<T> {
  source: string;
  measuredAt: string;
  tool: string;
  args: Record<string, unknown>;
  raw: string;
  value: T | null;
  error: string | null;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}
const count = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid count");
  return value;
};
const nullableString = (value: unknown): string | null => {
  if (value === null || typeof value === "string") return value;
  throw new Error("Invalid nullable string");
};
/** Validate the recorded order-indexer envelope. Nonempty orders remain unqualified raw objects.
 * @example parseSwapPage({ page: 1, total: 0, swaps: [] });
 */
export function parseSwapPage(value: unknown): SwapPage {
  const o = object(value);
  if (!Array.isArray(o.swaps) || o.swaps.length > 20) throw new Error("Invalid swap page");
  const rows = o.swaps.map(object);
  const total = count(o.total),
    page = count(o.page);
  if (page < 1 || total < rows.length) throw new Error("Inconsistent swap page");
  return { page, total, rows };
}
/** Validate selected HTLC fields. A row is not evidence of a paired swap.
 * @example parseHtlcs({ htlcs: [] });
 */
export function parseHtlcs(value: unknown): HtlcRow[] {
  const o = object(value);
  if (o.errors !== undefined || !Array.isArray(o.htlcs) || o.htlcs.length > 20)
    throw new Error("Invalid HTLC response");
  return o.htlcs.map((value) => {
    const row = object(value);
    if (typeof row.hashLock !== "string") throw new Error("Missing hash lock");
    normalizeHashLock(row.hashLock);
    const amount = nullableString(row.amount);
    if (amount !== null && !/^\d+$/.test(amount)) throw new Error("Invalid amount");
    return {
      hashLock: row.hashLock,
      timeout: row.timeout === null ? null : count(row.timeout),
      status: nullableString(row.status),
      amount,
      sender: nullableString(row.sender),
      recipient: nullableString(row.recipient),
    };
  });
}
export interface HtlcCheck {
  status: "UNKNOWN" | "REPORTED";
  reportedStatus: string | null;
  explanation: string;
}
/** Interpret a checker response without treating an unavailable RPC as absence.
 * @example parseHtlcCheck("HTLC not found or RPC unavailable.");
 */
export function parseHtlcCheck(value: unknown): HtlcCheck {
  if (value === "HTLC not found or RPC unavailable.")
    return { status: "UNKNOWN", reportedStatus: null, explanation: value };
  // A positive checker schema has not been observed. Do not guess which field is authoritative.
  return {
    status: "UNKNOWN",
    reportedStatus: null,
    explanation: "Unrecognized checker response. Inspect the dated raw evidence; no on-chain status is verified.",
  };
}
function recorded<T>(
  fixture: { source: string; measuredAt: string; tool: string; args: Record<string, unknown>; raw: string },
  parser: (value: unknown) => T,
): Observation<T> {
  let value: unknown = fixture.raw;
  try {
    value = JSON.parse(fixture.raw);
  } catch {
    /* The checker can return plain text. */
  }
  return { ...fixture, value: parser(value), error: null };
}
/** Replay the bundled dated public reads without network access.
 * @example const report = recordedObservations();
 */
export function recordedObservations() {
  return {
    mode: "recorded" as const,
    swaps: recorded(swapFixture, parseSwapPage),
    htlcs: recorded(htlcFixture, parseHtlcs),
    check: recorded(checkFixture, parseHtlcCheck),
  };
}

/** One bounded read-only service. Each successful result is cached for 30 seconds in this instance.
 * @example const reader = new SwapReader(); await reader.observe();
 */
export class SwapReader {
  private cache = new Map<string, { expires: number; observation: Observation<unknown> }>();
  private pending = new Map<string, Promise<Observation<unknown>>>();
  constructor(
    private readonly client = new McpClient({ retries: 1, timeoutMs: 8_000 }),
    private readonly now = Date.now,
  ) {}
  private async read<T>(
    tool: string,
    args: Record<string, unknown>,
    parser: (value: unknown) => T,
  ): Promise<Observation<T>> {
    const key = JSON.stringify([tool, args]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return cached.observation as Observation<T>;
    const pending = this.pending.get(key);
    if (pending) return pending as Promise<Observation<T>>;
    const work = (async (): Promise<Observation<T>> => {
      let raw = "",
        measuredAt = new Date(this.now()).toISOString();
      try {
        const result = await this.client.callTool(tool, args);
        raw = result.raw;
        measuredAt = result.measuredAt;
        const observation = {
          source: DEFAULT_URL,
          tool,
          args,
          raw,
          measuredAt,
          value: parser(result.value),
          error: null,
        };
        this.cache.set(key, { expires: this.now() + 30_000, observation });
        // Bound hash lookups as well as response lifetime.
        if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
        return observation;
      } catch (error) {
        return {
          source: DEFAULT_URL,
          tool,
          args,
          raw,
          measuredAt,
          value: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })();
    this.pending.set(key, work);
    try {
      return await work;
    } finally {
      this.pending.delete(key);
    }
  }
  /** Fetch one page from each surface. @example await new SwapReader().observe(); */
  async observe() {
    const swaps = await this.read("flop_list_swaps", { pair: "FLOP_BTC", status: "open", limit: 20 }, parseSwapPage);
    const htlcs = await this.read("flop_indexer_query", { query: HTLC_QUERY }, parseHtlcs);
    return { mode: "live" as const, swaps, htlcs };
  }
  /** Send only a hash lock to the hosted checker. @example await new SwapReader().check("00".repeat(32)); */
  async check(hashLock: string) {
    return this.read("flop_check_htlc", { hash_lock: normalizeHashLock(hashLock) }, parseHtlcCheck);
  }
}
