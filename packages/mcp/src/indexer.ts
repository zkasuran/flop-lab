// SPDX-License-Identifier: Apache-2.0
import { indexerQuery } from "./api";
import { DEFAULT_URL, McpError, type McpClient } from "./client";

interface Schema<T> {
  selection: string;
  parse: (value: unknown) => T;
}
type Parsed<S> = S extends Schema<infer T> ? T : never;
function invalid(): never {
  throw new McpError("Indexer response does not match the selected schema", "protocol");
}
const string: Schema<string> = {
  selection: "",
  parse: (v) => (typeof v === "string" ? v : invalid()),
};
const integer: Schema<number> = {
  selection: "",
  parse: (v) => (typeof v === "number" && Number.isSafeInteger(v) ? v : invalid()),
};
const float: Schema<number> = {
  selection: "",
  parse: (v) => (typeof v === "number" && Number.isFinite(v) ? v : invalid()),
};
const boolean: Schema<boolean> = {
  selection: "",
  parse: (v) => (typeof v === "boolean" ? v : invalid()),
};
const amount: Schema<string> = {
  selection: "",
  parse: (v) => (typeof v === "string" && /^\d+$/.test(v) ? v : invalid()),
};
function nullable<T>(s: Schema<T>): Schema<T | null> {
  return { selection: s.selection, parse: (v) => (v === null ? null : s.parse(v)) };
}
function list<T>(s: Schema<T>): Schema<T[]> {
  return { selection: s.selection, parse: (v) => (Array.isArray(v) ? v.map(s.parse) : invalid()) };
}
function object<S extends Record<string, Schema<unknown>>>(shape: S): Schema<{ [K in keyof S]: Parsed<S[K]> }> {
  return {
    selection: `{ ${Object.entries(shape)
      .map(([k, s]) => `${k} ${s.selection}`)
      .join(" ")} }`,
    parse: (v) => {
      if (!v || typeof v !== "object" || Array.isArray(v)) return invalid();
      const row = v as Record<string, unknown>;
      return Object.fromEntries(Object.entries(shape).map(([k, s]) => [k, s.parse(row[k])])) as {
        [K in keyof S]: Parsed<S[K]>;
      };
    },
  };
}
const ns = nullable(string),
  ni = nullable(integer),
  nf = nullable(float),
  na = nullable(amount);
const block = object({
  hash: string,
  parentHash: ns,
  number: integer,
  timestamp: nf,
  extrinsicsCount: ni,
  specVersion: ni,
});
const transaction = object({
  hash: string,
  blockHash: ns,
  blockNumber: ni,
  indexInBlock: ni,
  section: ns,
  method: ns,
  sender: ns,
  args: ns,
  success: ni,
  timestamp: nf,
});
const account = object({ address: string, balance: na, nonce: ni, firstSeenBlock: ni, lastSeenBlock: ni, txCount: ni });
const htlc = object({
  hashLock: string,
  htlcId: ns,
  sender: ns,
  recipient: ns,
  amount: na,
  timeout: ni,
  status: ns,
  paymentStatus: ns,
  evidenceStatus: ns,
  verifierRef: ns,
  timeoutPath: ns,
  observationHead: ns,
  preImage: ns,
  gnUsed: ni,
  receiptHash: ns,
  createdAt: nf,
  settledAt: nf,
  refundedAt: nf,
  blockHash: ns,
  blockNumber: ni,
});
const reference = object({
  kind: string,
  event: string,
  blockNumber: integer,
  blockHash: ns,
  timestamp: nf,
  gpuSku: ns,
  extrinsicHash: ns,
  extrinsicIndex: ni,
  eventIndex: ni,
  callSection: ns,
  callMethod: ns,
});
const channel = object({
  channelId: string,
  agent: ns,
  miner: ns,
  escrow: amount,
  measuredRoot: ns,
  modelHash: ns,
  status: string,
  paymentStatus: ns,
  evidenceStatus: ns,
  verifierRef: ns,
  timeoutPath: ns,
  observationHead: ns,
  aggregateGn: na,
  minerPaid: na,
  burned: na,
  cooperative: nullable(boolean),
  finalRoot: ns,
  challengeEnd: ni,
  refunded: na,
  marketKind: string,
  openedBlock: integer,
  statusBlockNumber: ni,
  openedAt: float,
  updatedAt: float,
  settlement: nullable(reference),
});
const settlement = object({
  channelId: string,
  settledBlock: integer,
  settledAt: float,
  settledBlockHash: ns,
  agent: ns,
  miner: ns,
  escrow: amount,
  minerPaid: amount,
  burned: amount,
  aggregateGn: amount,
  unusedEscrow: amount,
  pricePerGflop: string,
  cooperative: nullable(boolean),
  settlementKind: string,
  settlementEvent: string,
  marketKind: string,
  modelHash: ns,
  gpuSku: ns,
  assuranceTier: ns,
  selfTrade: boolean,
  extrinsicHash: ns,
  extrinsicIndex: ni,
  eventIndex: ni,
  callSection: ns,
  callMethod: ns,
});
const proof = object({
  id: string,
  blockHash: ns,
  blockNumber: ni,
  submitter: ns,
  gnWeight: nf,
  successCount: ni,
  taskHash: ns,
  timestamp: nf,
});
const reliability = object({
  id: string,
  miner: ns,
  agent: ns,
  kind: string,
  channelId: ns,
  taskHash: ns,
  escrow: na,
  refunded: na,
  minerPaid: na,
  agentRefunded: na,
  aggregateGn: na,
  failedAcks: ni,
  failedOfferOpens: ni,
  gnWeight: nf,
  latencyMs: nf,
  ceilingGflopsPerSec: nf,
  blockNumber: integer,
  blockHash: ns,
  timestamp: float,
});
const sponsor = object({
  id: string,
  role: string,
  positionId: string,
  sponsor: string,
  operator: string,
  amount,
  remainingPrincipal: amount,
  status: string,
  unlockBlock: ni,
  rewardPolicy: ns,
  startedBlock: ni,
  updatedBlock: ni,
  updatedAt: nf,
});
const pagination = object({ total: integer, limit: integer, offset: integer, hasMore: boolean });
function connection<T>(schema: Schema<T>) {
  const s = object({ data: list(schema), pagination });
  return {
    ...s,
    parse: (v: unknown) => {
      const value = s.parse(v);
      const p = value.pagination;
      if (p.total < 0 || p.limit < 1 || p.offset < 0 || value.data.length > p.limit || value.data.length > p.total)
        invalid();
      return value;
    },
  };
}
const schemas = {
  block: nullable(block),
  blocks: list(block),
  transaction: nullable(transaction),
  transactions: list(transaction),
  account: nullable(account),
  htlc: nullable(htlc),
  htlcs: list(htlc),
  computeChannel: nullable(channel),
  computeChannels: connection(channel),
  settlementPrice: nullable(settlement),
  settlementPrices: connection(settlement),
  pouiProofs: list(proof),
  reliabilityEvents: connection(reliability),
  sponsorPositions: list(sponsor),
  inferenceSpend: object({ address: string, totalSpentRaw: amount, channelCount: integer, settledChannels: integer }),
  inferenceReceived: object({ address: string, totalReceivedRaw: amount, settledChannels: integer }),
  htlcPaid: object({ address: string, totalPaidRaw: amount, htlcCount: integer }),
  htlcReceived: object({ address: string, totalReceivedRaw: amount, htlcCount: integer }),
  minerReliability: object({
    miner: string,
    settledCount: integer,
    settledVolumeGn: amount,
    timeoutCount: integer,
    voidedCount: integer,
    forceOpenExpiredCount: integer,
    lastFailedAcks: ni,
    offerOpenFailedCount: integer,
    lastFailedOfferOpens: ni,
    offerOpenFailureEvidence: string,
    ghost: object({ issued: integer, completed: integer, expired: integer, incorrect: integer }),
    tripwireRejections: integer,
    disputesOpened: integer,
    fraudUpheld: integer,
  }),
};
export type IndexerEntity = keyof typeof schemas;
export type IndexerData<K extends IndexerEntity> = Parsed<(typeof schemas)[K]>;
type Paging = { limit?: number; offset?: number };
type Range = { address: string; from?: number; to?: number };
export interface IndexerArguments {
  block: { hash: string; number?: never } | { number: number; hash?: never };
  blocks: Paging;
  transaction: { hash: string };
  transactions: Paging;
  account: { address: string };
  htlc: { hashLock: string };
  htlcs: Paging & { status?: string; address?: string };
  computeChannel: { channelId: string };
  computeChannels: Paging & { status?: string; agent?: string; miner?: string };
  settlementPrice: { channelId: string };
  settlementPrices: Paging & { model?: string; sku?: string; miner?: string; agent?: string; tier?: string };
  pouiProofs: Paging;
  reliabilityEvents: Paging & { miner?: string; kind?: string };
  sponsorPositions: Paging & { role?: string; sponsor?: string; operator?: string; status?: string };
  inferenceSpend: Range;
  inferenceReceived: Range;
  htlcPaid: Range;
  htlcReceived: Range;
  minerReliability: { miner: string };
}
const pageArgs = { limit: "Int", offset: "Int" };
const rangeArgs = { address: "String!", from: "Float", to: "Float" };
const args: Record<IndexerEntity, Record<string, string>> = {
  block: { hash: "String", number: "Int" },
  blocks: pageArgs,
  transaction: { hash: "String!" },
  transactions: pageArgs,
  account: { address: "String!" },
  htlc: { hashLock: "String!" },
  htlcs: { ...pageArgs, status: "String", address: "String" },
  computeChannel: { channelId: "String!" },
  computeChannels: { ...pageArgs, status: "String", agent: "String", miner: "String" },
  settlementPrice: { channelId: "String!" },
  settlementPrices: { ...pageArgs, model: "String", sku: "String", miner: "String", agent: "String", tier: "String" },
  pouiProofs: pageArgs,
  reliabilityEvents: { ...pageArgs, miner: "String", kind: "String" },
  sponsorPositions: { ...pageArgs, role: "String", sponsor: "String", operator: "String", status: "String" },
  inferenceSpend: rangeArgs,
  inferenceReceived: rangeArgs,
  htlcPaid: rangeArgs,
  htlcReceived: rangeArgs,
  minerReliability: { miner: "String!" },
};

/** Validate one selected root field. A null entity is distinct from an empty list.
 * @example parseIndexerData("blocks", { blocks: [] })
 */
export function parseIndexerData<K extends IndexerEntity>(entity: K, response: unknown): IndexerData<K> {
  if (!response || typeof response !== "object" || Array.isArray(response)) return invalid();
  const root = response as Record<string, unknown>;
  if (root.errors !== undefined) return invalid();
  return schemas[entity].parse(root[entity]) as IndexerData<K>;
}

/** Read a fixed selection using variables, preserving query, source and response time.
 * List queries default to 20 rows and never auto-paginate. Limit is capped at 100.
 * @example await readIndexer(client, "block", { number: 100 })
 */
export async function readIndexer<K extends IndexerEntity>(client: McpClient, entity: K, input: IndexerArguments[K]) {
  if (!Object.hasOwn(schemas, entity)) throw new Error("Unknown indexer entity");
  const variables: Record<string, unknown> = { ...input };
  const definition = args[entity];
  if (Object.hasOwn(definition, "limit")) {
    variables.limit ??= 20;
    variables.offset ??= 0;
  }
  for (const [key, type] of Object.entries(definition)) {
    if (type.endsWith("!") && variables[key] === undefined) throw new Error(`Missing ${key}`);
  }
  if (entity === "block" && (variables.hash === undefined) === (variables.number === undefined))
    throw new Error("Provide a block hash or number");
  for (const [key, value] of Object.entries(variables)) {
    if (!Object.hasOwn(definition, key)) throw new Error(`Unknown argument ${key}`);
    const type = definition[key]!;
    if (type.startsWith("String") && (typeof value !== "string" || value.length === 0 || value.length > 256))
      throw new Error(`Invalid ${key}`);
    if (type === "Int" && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 2147483647))
      throw new Error(`Invalid ${key}`);
    if (type === "Float" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`Invalid ${key}`);
  }
  if (typeof variables.limit === "number" && (variables.limit < 1 || variables.limit > 100))
    throw new Error("Limit must be 1 to 100");
  const keys = Object.keys(variables);
  const declarations = keys.map((k) => `$${k}: ${definition[k]}`).join(", ");
  const parameters = keys.map((k) => `${k}: $${k}`).join(", ");
  const query = `query Explorer${keys.length ? `(${declarations})` : ""} { ${entity}${keys.length ? `(${parameters})` : ""} ${schemas[entity].selection} }`;
  const result = await indexerQuery(client, query, variables);
  return {
    ...result,
    value: parseIndexerData(entity, result.value),
    query,
    variables,
    source: DEFAULT_URL,
    tool: "flop_indexer_query" as const,
  };
}
