// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_URL, McpClient, readIndexer, type IndexerArguments, type IndexerEntity } from "@flop-lab/mcp";
import type { Derived, Entity, Evidence, Exploration, Kind } from "./types";
export type { Derived, Entity, Evidence, Exploration, Kind } from "./types";
export { parseExploration } from "./report";
export { recordedExploration } from "./recorded";
export { SearchBudget } from "./budget";

const hash = /^0x[0-9a-fA-F]{64}$/;
const address = /^[1-9A-HJ-NP-Za-km-z]{47,50}$/;
const roots = {
  block: "block",
  transaction: "transaction",
  account: "account",
  channel: "computeChannel",
  htlc: "htlc",
} as const;

/** Classify syntax without claiming that an entity exists or an address checksum is valid.
 * @example classify("block:100") // { input: "100", kinds: ["block"] }
 */
export function classify(value: string): { input: string; kinds: Kind[] } {
  const trimmed = value.trim();
  if (trimmed.length > 128) throw new Error("Search input is too long");
  const match = /^(block|tx|transaction|account|channel|htlc):(.+)$/.exec(trimmed);
  const input = (match?.[2] ?? trimmed).trim();
  const prefix = match?.[1] === "tx" ? "transaction" : match?.[1];
  let kinds: Kind[];
  if (/^\d{1,10}$/.test(input) && Number(input) <= 2147483647) kinds = ["block"];
  else if (hash.test(input)) kinds = ["block", "transaction", "channel", "htlc"];
  else if (address.test(input)) kinds = ["account"];
  else throw new Error("Enter a block number, 0x hash or SS58 address");
  if (prefix && !kinds.includes(prefix as Kind)) throw new Error("Search prefix does not match the input");
  return {
    input: hash.test(input)
      ? input.toLowerCase()
      : kinds[0] === "block" && !hash.test(input)
        ? String(Number(input))
        : input,
    kinds: prefix ? [prefix as Kind] : kinds,
  };
}

function record(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Check the settlement split with exact integer arithmetic. Missing amounts stay unknown.
 * @example settlementArithmetic({escrow:"10", minerPaid:"8", burned:"1", unusedEscrow:"1"})?.value
 */
export function settlementArithmetic(value: unknown): Derived | null {
  const row = record(value);
  if (
    !row ||
    !["escrow", "minerPaid", "burned", "unusedEscrow"].every(
      (k) => typeof row[k] === "string" && /^\d+$/.test(row[k] as string),
    )
  )
    return null;
  const escrow = BigInt(row.escrow as string);
  const sum = BigInt(row.minerPaid as string) + BigInt(row.burned as string) + BigInt(row.unusedEscrow as string);
  return {
    label: "Escrow split",
    value: sum === escrow ? "CONSERVED" : "MISMATCH",
    formula: `${row.minerPaid} + ${row.burned} + ${row.unusedEscrow} = ${sum}; escrow = ${escrow} raw units`,
    evidence: ["settlementPrice"],
  };
}

/** Parse the observed balance tool format without treating an indexer balance as live balance.
 * @example parseBalance({address:"example",free:"1 FLOP",reserved:"0 FLOP",nonce:0})
 */
export function parseBalance(value: unknown): Record<string, string | number> {
  const row = record(value);
  if (!row || typeof row.address !== "string" || !Number.isSafeInteger(row.nonce) || (row.nonce as number) < 0)
    throw new Error("Invalid balance response");
  const result: Record<string, string | number> = { address: row.address, nonce: row.nonce as number };
  for (const key of ["free", "reserved", "frozen"]) {
    if (key === "frozen" && row[key] === undefined) continue;
    if (typeof row[key] !== "string" || !/^\d+(?:\.\d+)? FLOP$/.test(row[key]))
      throw new Error(`Invalid balance ${key}`);
    result[key] = row[key];
  }
  return result;
}

/** Build a linked entity from validated primary evidence. Values retain their own evidence group.
 * @example entityFromEvidence("block", "100", evidence)
 */
export function entityFromEvidence(kind: Kind, id: string, primary: Evidence): Entity {
  const row = record(primary.data) ?? {};
  const links: Entity["links"] = [];
  const add = (label: string, prefix: string, value: unknown) => {
    if (typeof value === "string" && (hash.test(value) || address.test(value)))
      links.push({ label, input: `${prefix}:${value}` });
  };
  add("Parent block", "block", row.parentHash);
  add("Block", "block", row.blockHash);
  add("Sender", "account", row.sender);
  add("Recipient", "account", row.recipient);
  add("Agent", "account", row.agent);
  add("Miner", "account", row.miner);
  const notes: string[] = [];
  if (kind === "transaction")
    notes.push(
      "Fees and events are not exposed by the indexer schema. Arguments are indexed text. Success is the indexer's flag, not an execution proof.",
    );
  if (kind === "block")
    notes.push(
      "Transactions are matched by block hash from at most 100 recent rows. This is a partial window, not a complete block transaction list.",
    );
  if (kind === "account")
    notes.push(
      "Indexer balance and the balance tool are separate observations. Frozen balance is unavailable when omitted. Address syntax is checked; the SS58 checksum is not.",
      "HTLCs and sponsor positions are first pages only. Empty pages are not proof of no historic activity.",
    );
  if (kind === "channel")
    notes.push(
      "Escrow arithmetic uses a settlement price row when present. Open channels have no final split to check. Arithmetic does not prove inference or settlement finality.",
    );
  if (kind === "htlc")
    notes.push(
      "Indexer status and the HTLC checker can disagree. An unavailable checker is not proof that the HTLC does not exist.",
    );
  return { kind, id, evidence: [primary], derived: [], notes, links };
}

/** Search with a shared, spaced MCP client. Successful results cache for 15 seconds.
 * At most 100 keys are retained. Failed or partial results cache for 5 seconds.
 * Concurrent searches serialize, making each request count exact. Same-key calls coalesce.
 * @example const result = await new Explorer().search("block:100")
 */
export class Explorer {
  private readonly client: McpClient;
  private readonly cache = new Map<string, { expires: number; result: Exploration }>();
  private readonly pending = new Map<string, Promise<Exploration>>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    client = new McpClient({ retries: 1, minIntervalMs: 250, timeoutMs: 8000 }),
    private readonly now = Date.now,
  ) {
    this.client = client;
  }

  /** Resolve all matching kinds. A hash can identify more than one entity.
   * @example await explorer.search("channel:0x" + "a".repeat(64))
   */
  async search(input: string): Promise<Exploration> {
    const parsed = classify(input);
    const key = `${parsed.kinds.join(",")}:${parsed.input}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now())
      return structuredClone({ ...cached.result, cache: "hit" as const, requests: 0 });
    const pending = this.pending.get(key);
    if (pending) return structuredClone({ ...(await pending), cache: "hit" as const, requests: 0 });
    if (this.pending.size >= 16) throw new Error("Explorer is busy. Retry after a short pause.");
    const work = this.queue.then(() => this.run(parsed));
    this.queue = work.catch(() => undefined);
    this.pending.set(key, work);
    try {
      const result = await work;
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, {
        expires: this.now() + (result.status === "partial" || result.status === "unavailable" ? 5000 : 15000),
        result: structuredClone(result),
      });
      return result;
    } finally {
      this.pending.delete(key);
    }
  }

  private async observe<K extends IndexerEntity>(label: K, variables: IndexerArguments[K]): Promise<Evidence> {
    try {
      const r = await readIndexer(this.client, label, variables);
      return {
        label,
        source: r.source,
        tool: r.tool,
        query: r.query,
        variables: r.variables,
        measuredAt: r.measuredAt,
        state: "observed",
        data: r.value,
        raw: r.raw,
        error: null,
      };
    } catch (error) {
      return {
        label,
        source: DEFAULT_URL,
        tool: "flop_indexer_query",
        query: null,
        variables: { ...variables },
        measuredAt: new Date(this.now()).toISOString(),
        state: "unavailable",
        data: null,
        raw: null,
        error: errorText(error),
      };
    }
  }
  private async tool(
    name: "flop_get_balance" | "flop_check_htlc",
    variables: Record<string, unknown>,
  ): Promise<Evidence> {
    const base = { label: name, source: DEFAULT_URL, tool: name, query: null, variables };
    try {
      const r = await this.client.callTool(name, variables);
      try {
        let data: unknown;
        if (name === "flop_get_balance") {
          data = parseBalance(r.value);
          if ((data as Record<string, unknown>).address !== variables.address)
            throw new Error("Balance address mismatch");
        } else {
          const value = record(r.value);
          if (!value || !["CREATED", "SETTLED", "REFUNDED"].includes(String(value.status)))
            throw new Error(typeof r.value === "string" ? r.value : "HTLC checker response has no recognized status");
          data = { status: value.status };
        }
        return { ...base, measuredAt: r.measuredAt, state: "observed", data, raw: r.raw, error: null };
      } catch (error) {
        return {
          ...base,
          measuredAt: r.measuredAt,
          state: "unavailable",
          data: null,
          raw: r.raw,
          error: errorText(error),
        };
      }
    } catch (error) {
      return {
        ...base,
        measuredAt: new Date(this.now()).toISOString(),
        state: "unavailable",
        data: null,
        raw: null,
        error: errorText(error),
      };
    }
  }

  private async run(parsed: ReturnType<typeof classify>): Promise<Exploration> {
    const started = this.now(),
      requests = this.client.stats.requests;
    const lookups: Evidence[] = [],
      entities: Entity[] = [];
    for (const kind of parsed.kinds) {
      const input = parsed.input;
      const primary =
        kind === "block"
          ? await this.observe("block", hash.test(input) ? { hash: input } : { number: Number(input) })
          : kind === "transaction"
            ? await this.observe("transaction", { hash: input })
            : kind === "account"
              ? await this.observe("account", { address: input })
              : kind === "channel"
                ? await this.observe("computeChannel", { channelId: input })
                : await this.observe("htlc", { hashLock: input });
      lookups.push(primary);
      if (primary.state !== "observed" || primary.data === null) continue;
      const matchRow = record(primary.data)!;
      const matchValue =
        kind === "block"
          ? hash.test(input)
            ? matchRow.hash
            : String(matchRow.number)
          : kind === "transaction"
            ? matchRow.hash
            : kind === "channel"
              ? matchRow.channelId
              : kind === "htlc"
                ? matchRow.hashLock
                : matchRow.address;
      if (matchValue !== input) {
        primary.state = "unavailable";
        primary.error = "Indexer returned a different entity identifier";
        continue;
      }
      const entity = entityFromEvidence(kind, input, primary);
      entities.push(entity);
      const row = record(primary.data)!;
      if (kind === "block") {
        if (typeof row.parentHash === "string") {
          const parent = await this.observe("block", { hash: row.parentHash });
          parent.label = "parentBlock";
          entity.evidence.push(parent);
          const parentRow = record(parent.data);
          if (typeof row.timestamp === "number" && typeof parentRow?.timestamp === "number")
            entity.derived.push({
              label: "Parent interval",
              value: `${row.timestamp - parentRow.timestamp} ms`,
              formula: "block.timestamp - parentBlock.timestamp",
              evidence: ["block", "parentBlock"],
            });
        }
        const recent = await this.observe("transactions", { limit: 100 });
        entity.evidence.push(recent);
        if (Array.isArray(recent.data)) {
          const matching = recent.data.filter((v) => record(v)?.blockHash === row.hash);
          entity.derived.push({
            label: "Transactions in recent window",
            value: String(matching.length),
            formula: "transactions.filter(tx => tx.blockHash === block.hash).length; recent window only",
            evidence: ["block", "transactions"],
          });
          for (const tx of matching)
            entity.links.push({ label: "Transaction", input: `tx:${String(record(tx)?.hash)}` });
        }
      }
      if (kind === "channel") {
        const price = await this.observe("settlementPrice", { channelId: input });
        entity.evidence.push(price);
        const derived = settlementArithmetic(price.data);
        if (derived) entity.derived.push(derived);
      }
      if (kind === "htlc") entity.evidence.push(await this.tool("flop_check_htlc", { hash_lock: input }));
      if (kind === "account") {
        entity.evidence.push(await this.tool("flop_get_balance", { address: input }));
        for (const root of ["inferenceSpend", "inferenceReceived", "htlcPaid", "htlcReceived"] as const)
          entity.evidence.push(await this.observe(root, { address: input }));
        entity.evidence.push(await this.observe("htlcs", { address: input, limit: 20 }));
        const sponsored = await this.observe("sponsorPositions", { sponsor: input, limit: 20 });
        sponsored.label = "positionsAsSponsor";
        entity.evidence.push(sponsored);
        const operated = await this.observe("sponsorPositions", { operator: input, limit: 20 });
        operated.label = "positionsAsOperator";
        entity.evidence.push(operated);
        entity.evidence.push(await this.observe("minerReliability", { miner: input }));
      }
    }
    const failed = [...lookups, ...entities.flatMap((e) => e.evidence)].some((e) => e.state === "unavailable");
    return {
      input: parsed.kinds.length === 1 ? `${parsed.kinds[0]}:${parsed.input}` : parsed.input,
      mode: "live",
      searchedAt: new Date(started).toISOString(),
      status: entities.length ? (failed ? "partial" : "found") : failed ? "unavailable" : "not_found",
      entities,
      lookups,
      requests: this.client.stats.requests - requests,
      durationMs: this.now() - started,
      cache: "miss",
    };
  }
}

/** Human-readable output retains every value and its query evidence.
 * @example console.log(formatExploration(result))
 */
export function formatExploration(result: Exploration): string {
  const lines = [
    `${result.status.toUpperCase()} ${result.input}`,
    `${result.mode} | ${result.searchedAt} | ${result.requests} HTTP requests | ${result.durationMs} ms | cache ${result.cache}`,
  ];
  for (const entity of result.entities) {
    lines.push(`\n${entity.kind.toUpperCase()} ${entity.id}`, ...entity.notes);
    for (const d of entity.derived) lines.push(`${d.label}: ${d.value}\nFormula: ${d.formula}`);
    for (const e of entity.evidence)
      lines.push(
        `\n${e.label}: ${e.state}\n${e.source} | ${e.measuredAt}\n${e.tool} ${e.query ?? ""}\nVariables: ${JSON.stringify(e.variables)}\n${e.error ?? JSON.stringify(e.data, null, 2)}`,
      );
  }
  for (const e of result.lookups.filter((e) => e.state === "unavailable" || e.data === null))
    lines.push(
      `${e.label}: ${e.error ?? "No indexed match"} | ${e.source} | ${e.measuredAt}\n${e.query ?? e.tool} ${JSON.stringify(e.variables)}`,
    );
  return lines.join("\n");
}

export { roots as indexerRoots };
