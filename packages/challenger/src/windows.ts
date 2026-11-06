// SPDX-License-Identifier: Apache-2.0
import { McpClient, DEFAULT_URL, parseIndexerData, readIndexer } from "../../mcp/src/index";
import { sealObservation, type Observation as RawObservation } from "../../verifier/src/index";
import { block, integer, object, timestamp } from "./validation";

export const WINDOW_PARAMETER = {
  name: "channel_dispute_window_blocks",
  blocks: 604_800,
  measuredAt: "2026-11-06T03:49:31.027Z",
  source:
    "https://raw.githubusercontent.com/flop-labs/yellowpaper/2a2cc8218048a2933071bb2f45d75335560e39d8/params/flop-protocol-params.yaml",
  quote: "on_chain: {constants: [ComputeChannel.DisputeWindow]}\n    value: 604_800\n    unit: blocks",
  runtimeVerified: false,
} as const;
// This is an attention policy, not the protocol's response deadline.
export const CLOSING_BLOCKS = 7_200;
export const FINALIZED_HEAD_QUERY = "{ stats { finality { bestBlock finalizedBlock finalizedLag state safeMode } } }";

export interface WindowCapture {
  capturedAt: string;
  observations: RawObservation[];
  requests: number;
}
export interface BlockWindow {
  channelId: string;
  status: "open" | "closing" | "closed" | "unknown";
  endBlock: number | null;
  headBlock: number | null;
  remainingBlocks: number | null;
  estimatedRemainingMs: number | null;
  estimatedExpiry: string | null;
  reason: string;
  measuredAt: string;
  source: string;
  escrow: string;
  parameter: typeof WINDOW_PARAMETER;
}
export interface WindowReport {
  capturedAt: string;
  head: { number: number; measuredAt: string; source: string; safeMode: boolean } | null;
  cadence: { milliseconds: number; intervals: number; firstBlock: number; lastBlock: number } | null;
  rows: BlockWindow[];
  complete: boolean;
  total: number | null;
  warnings: string[];
  requests: number;
}

function payload(observation: RawObservation | undefined): unknown {
  if (!observation?.raw) throw new Error(observation?.error ?? "Observation unavailable");
  return JSON.parse(observation.raw) as unknown;
}

function finality(value: unknown) {
  const f = object(object(object(value, "head").stats, "stats").finality, "finality");
  const best = integer(f.bestBlock, "bestBlock");
  const head = integer(f.finalizedBlock, "finalizedBlock");
  if (head > best || integer(f.finalizedLag, "finalizedLag") !== best - head)
    throw new Error("Inconsistent reported finalized head");
  if (typeof f.safeMode !== "boolean") throw new Error("Missing finality safeMode");
  return { number: head, safeMode: f.safeMode };
}

/** Collect forced claims and a reported finalized head. Bounded to 100 claims and four base requests.
 * @example await collectWindows(new McpClient({ retries: 1 }))
 */
export async function collectWindows(client: McpClient): Promise<WindowCapture> {
  const before = client.stats.requests;
  const observations: RawObservation[] = [];
  const observe = async (id: string, tool: string, args: Record<string, unknown>) => {
    const start = Date.now();
    try {
      const r = await client.callTool(tool, args);
      const o = await sealObservation({
        id,
        tool,
        args,
        source: DEFAULT_URL,
        measuredAt: r.measuredAt,
        durationMs: r.durationMs,
        attempts: r.attempts,
        raw: r.raw,
        error: null,
      });
      observations.push(o);
      return o;
    } catch (error) {
      const o = await sealObservation({
        id,
        tool,
        args,
        source: DEFAULT_URL,
        measuredAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        attempts: 1,
        raw: null,
        error: error instanceof Error ? error.message : "Request failed",
      });
      observations.push(o);
      return o;
    }
  };
  const channelStarted = Date.now();
  try {
    const r = await readIndexer(client, "computeChannels", { status: "settling", limit: 100, offset: 0 });
    observations.push(
      await sealObservation({
        id: "windows",
        tool: r.tool,
        args: { query: r.query, variables: r.variables },
        source: r.source,
        measuredAt: r.measuredAt,
        durationMs: r.durationMs,
        attempts: r.attempts,
        raw: r.raw,
        error: null,
      }),
    );
  } catch (error) {
    observations.push(
      await sealObservation({
        id: "windows",
        tool: "flop_indexer_query",
        args: { status: "settling", limit: 100, offset: 0 },
        source: DEFAULT_URL,
        measuredAt: new Date().toISOString(),
        durationMs: Date.now() - channelStarted,
        attempts: 1,
        raw: null,
        error: error instanceof Error ? error.message : "Request failed",
      }),
    );
  }
  const h = await observe("window-head", "flop_indexer_query", { query: FINALIZED_HEAD_QUERY });
  try {
    const head = finality(payload(h));
    for (const number of [...new Set([Math.max(0, head.number - 100), head.number])])
      await observe(`window-block:${number}`, "flop_get_block", { number });
  } catch {
    /* Missing head stays unknown. Never substitute best head. */
  }
  return { capturedAt: new Date().toISOString(), observations, requests: client.stats.requests - before };
}

/** Replay block-window arithmetic. Closed means the observed boundary has been reached, not finalized payment.
 * @example const report = analyzeWindows(capture)
 */
export function analyzeWindows(capture: WindowCapture): WindowReport {
  timestamp(Date.parse(capture.capturedAt), "capturedAt");
  const result: WindowReport = {
    capturedAt: capture.capturedAt,
    head: null,
    cadence: null,
    rows: [],
    complete: false,
    total: null,
    warnings: [],
    requests: integer(capture.requests, "requests"),
  };
  const get = (id: string) => capture.observations.find((o) => o.id === id);
  try {
    const o = get("window-head")!;
    result.head = { ...finality(payload(o)), measuredAt: o.measuredAt, source: o.source };
    const blocks = capture.observations
      .filter((o) => o.id.startsWith("window-block:"))
      .map((o) => {
        const b = block(payload(o));
        if (b.number !== o.args.number) throw new Error("Block height differs from request");
        return b;
      })
      .sort((a, b) => a.number - b.number);
    const first = blocks[0],
      last = blocks.at(-1);
    if (
      first &&
      last &&
      last.number === result.head.number &&
      last.number > first.number &&
      last.timestamp > first.timestamp &&
      last.timestamp <= Date.parse(capture.capturedAt)
    ) {
      result.cadence = {
        milliseconds: (last.timestamp - first.timestamp) / (last.number - first.number),
        intervals: last.number - first.number,
        firstBlock: first.number,
        lastBlock: last.number,
      };
    }
  } catch (error) {
    result.warnings.push(error instanceof Error ? error.message : "Head or cadence unavailable");
  }
  try {
    const o = get("windows")!;
    const page = parseIndexerData("computeChannels", payload(o));
    if (page.pagination.offset !== 0 || page.data.length > 100) throw new Error("Unexpected window pagination");
    const seen = new Set<string>();
    result.total = page.pagination.total;
    result.complete = !page.pagination.hasMore && page.data.length === page.pagination.total;
    for (const c of page.data) {
      if (!/^0x[0-9a-f]{64}$/i.test(c.channelId) || seen.has(c.channelId))
        throw new Error("Invalid or duplicate channel ID");
      seen.add(c.channelId);
      const row: BlockWindow = {
        channelId: c.channelId,
        status: "unknown",
        endBlock: c.challengeEnd,
        headBlock: result.head?.number ?? null,
        remainingBlocks: null,
        estimatedRemainingMs: null,
        estimatedExpiry: null,
        reason: "Missing forced-claim boundary or reported finalized head.",
        measuredAt: o.measuredAt,
        source: o.source,
        escrow: c.escrow,
        parameter: WINDOW_PARAMETER,
      };
      const head = result.head;
      if (c.status !== "settling" || c.cooperative === true || c.finalRoot === null)
        row.reason = "Response does not establish an unfinalized forced claim.";
      else if (c.challengeEnd !== null && head) {
        if (
          c.challengeEnd < c.openedBlock ||
          (c.statusBlockNumber !== null && c.statusBlockNumber > head.number) ||
          c.updatedAt > Date.parse(capture.capturedAt)
        )
          row.reason = "Channel and head observations conflict. Check for capture drift or a devnet reset.";
        else {
          const remaining = Math.max(0, c.challengeEnd - head.number);
          row.remainingBlocks = remaining;
          row.status = remaining === 0 ? "closed" : remaining <= CLOSING_BLOCKS ? "closing" : "open";
          row.reason =
            "Indexed challengeEnd minus reported finalized head. Closing is the review policy's final 7200 blocks. Equality is treated as closed conservatively; runtime endpoint inclusion is unverified.";
          if (head.safeMode) row.reason += " Reported safe mode: do not extrapolate a running deadline.";
          else if (result.cadence) {
            const ms = remaining * result.cadence.milliseconds;
            const expiry = Date.parse(head.measuredAt) + ms;
            if (Number.isSafeInteger(Math.round(ms)) && expiry < 8_640_000_000_000_000) {
              row.estimatedRemainingMs = ms;
              row.estimatedExpiry = remaining ? new Date(expiry).toISOString() : null;
            }
          }
        }
      }
      result.rows.push(row);
    }
  } catch (error) {
    result.rows = [];
    result.complete = false;
    result.warnings.push(error instanceof Error ? error.message : "Window data unavailable");
  }
  const order = { closing: 0, open: 1, unknown: 2, closed: 3 };
  result.rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      (a.endBlock ?? Infinity) - (b.endBlock ?? Infinity) ||
      a.channelId.localeCompare(b.channelId),
  );
  return result;
}
