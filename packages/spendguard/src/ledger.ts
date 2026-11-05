// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseFlop, parseRequest, type Reservation, type SpendRequest } from "./policy";

export type AuditEvent =
  | { kind: "dryRun"; at: number; fingerprint: string }
  | { kind: "deny"; at: number; request: SpendRequest; fired: string[] }
  | { kind: "reserve"; at: number; request: SpendRequest; fingerprint: string }
  | { kind: "outcome"; at: number; id: string; status: "returned" | "failed"; channelId: string | null }
  | { kind: "settled"; at: number; id: string; channelId: string; blockHash: string; source: string }
  | { kind: "refund"; at: number; id: string; amountRaw: string; channelId: string; blockHash: string; source: string };
export interface AuditLine {
  sequence: number;
  previous: string;
  event: AuditEvent;
  hash: string;
}
export interface LedgerState {
  events: AuditEvent[];
  reservations: Reservation[];
  head: string;
}
const GENESIS = "0".repeat(64);
const HASH = /^[a-f0-9]{64}$/;
const CHANNEL = /^0x[a-f0-9]{64}$/i;

/** Canonical JSON hashing binds policy and request content. @example digest({ task: "summary" }) */
export function digest(value: unknown): string {
  const canonical = (v: unknown): string => {
    if (typeof v === "bigint") return JSON.stringify(v.toString());
    if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
    if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
    if (v && typeof v === "object")
      return `{${Object.entries(v)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
        .join(",")}}`;
    throw new Error("Audit values must be JSON data");
  };
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export class LedgerIntegrityError extends Error {}

function fold(events: AuditEvent[]): Reservation[] {
  const reservations = new Map<string, Reservation>();
  const outcomes = new Map<string, string | null>();
  const refunded = new Set<string>();
  const channels = new Set<string>();
  let last = 0;
  for (const event of events) {
    if (!event || !Number.isSafeInteger(event.at) || event.at < last)
      throw new LedgerIntegrityError("Invalid audit clock");
    last = event.at;
    switch (event.kind) {
      case "dryRun":
        if (!HASH.test(event.fingerprint)) throw new LedgerIntegrityError("Invalid dry-run fingerprint");
        break;
      case "deny":
        parseRequest(event.request);
        if (!Array.isArray(event.fired) || event.fired.some((x) => typeof x !== "string"))
          throw new LedgerIntegrityError("Invalid deny trace");
        break;
      case "reserve": {
        const r = parseRequest(event.request);
        if (reservations.has(r.id) || !HASH.test(event.fingerprint) || r.at !== event.at)
          throw new LedgerIntegrityError("Duplicate or invalid reservation");
        reservations.set(r.id, { request: r, charged: parseFlop(r.amount).toString(), pending: true });
        break;
      }
      case "outcome":
        if (
          !reservations.has(event.id) ||
          outcomes.has(event.id) ||
          !["returned", "failed"].includes(event.status) ||
          (event.channelId !== null && (!CHANNEL.test(event.channelId) || channels.has(event.channelId)))
        )
          throw new LedgerIntegrityError("Invalid or duplicate outcome");
        outcomes.set(event.id, event.channelId);
        if (event.channelId) channels.add(event.channelId);
        break;
      case "settled": {
        const r = reservations.get(event.id);
        if (
          !r ||
          !r.pending ||
          outcomes.get(event.id) !== event.channelId ||
          !CHANNEL.test(event.blockHash) ||
          typeof event.source !== "string" ||
          !event.source
        )
          throw new LedgerIntegrityError("Invalid settlement binding");
        r.pending = false;
        break;
      }
      case "refund": {
        const r = reservations.get(event.id);
        if (
          !r ||
          !r.pending ||
          refunded.has(event.id) ||
          outcomes.get(event.id) !== event.channelId ||
          !CHANNEL.test(event.blockHash) ||
          typeof event.source !== "string" ||
          !event.source ||
          typeof event.amountRaw !== "string" ||
          !/^(0|[1-9]\d*)$/.test(event.amountRaw) ||
          BigInt(event.amountRaw) !== BigInt(r.charged)
        )
          throw new LedgerIntegrityError("Invalid refund or missing channel binding");
        // Only full finalized timeout/expiry refunds are supported. Fees are outside these budgets.
        r.charged = "0";
        r.pending = false;
        refunded.add(event.id);
        break;
      }
      default:
        throw new LedgerIntegrityError("Unknown audit event");
    }
  }
  return [...reservations.values()];
}

async function safeFile(path: string) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 20_000_000)
    throw new LedgerIntegrityError("Ledger must be a regular single-link file below 20 MB");
}
async function durable(path: string, content: string, flag: "wx" | "a") {
  const handle = await open(
    path,
    flag === "wx"
      ? constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW
      : constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function syncDirectory(path: string) {
  const handle = await open(dirname(path), "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Append-only ledger with an exclusive filesystem lock and separate head anchor.
 * A stale lock is never stolen. Missing or inconsistent files fail closed.
 * @example const ledger = new FileLedger("./spend.jsonl"); await ledger.initialize();
 */
export class FileLedger {
  constructor(
    readonly path: string,
    readonly lockTimeoutMs = 5000,
  ) {}
  private async locked<T>(fn: (path: string) => Promise<T>): Promise<T> {
    const path = join(await realpath(dirname(this.path)), basename(this.path));
    const lockPath = `${path}.lock`;
    const started = Date.now();
    let handle;
    for (;;) {
      try {
        handle = await open(lockPath, "wx", 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() - started >= this.lockTimeoutMs)
          throw new Error("Ledger locked; inspect the owning process before recovering a stale lock", { cause: error });
        await sleep(25);
      }
    }
    try {
      return await fn(path);
    } finally {
      await handle.close();
      await unlink(lockPath);
    }
  }
  /** Create once. Existing files are never replaced. @example await ledger.initialize() */
  async initialize(): Promise<void> {
    await this.locked(async (path) => {
      // Create the anchor first. A crash leaves an unusable ledger, never an implicit reset.
      await durable(`${path}.head`, `${GENESIS}\n`, "wx");
      await durable(path, "", "wx");
      await syncDirectory(path);
    });
  }
  private async load(path: string): Promise<LedgerState> {
    try {
      await safeFile(path);
      await safeFile(`${path}.head`);
      const [raw, anchor] = await Promise.all([readFile(path, "utf8"), readFile(`${path}.head`, "utf8")]);
      if (raw && !raw.endsWith("\n")) throw new Error("Incomplete trailing audit line");
      let previous = GENESIS;
      const events: AuditEvent[] = [];
      for (const [index, line] of (raw ? raw.slice(0, -1).split("\n") : []).entries()) {
        const record = JSON.parse(line) as AuditLine;
        if (
          Object.keys(record).sort().join(",") !== "event,hash,previous,sequence" ||
          record.sequence !== index + 1 ||
          record.previous !== previous ||
          record.hash !== digest({ sequence: record.sequence, previous, event: record.event })
        )
          throw new Error(`Broken hash chain at line ${index + 1}`);
        previous = record.hash;
        events.push(record.event);
      }
      if (anchor !== `${previous}\n`) throw new Error("Head anchor mismatch: truncation or interrupted write");
      return { events, reservations: fold(events), head: previous };
    } catch (error) {
      throw new LedgerIntegrityError(`Ledger integrity: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  /** Verify structure and the saved or externally pinned head. @example await ledger.verify(expectedHead) */
  async verify(expectedHead?: string): Promise<LedgerState> {
    return this.locked(async (path) => {
      const state = await this.load(path);
      if (expectedHead !== undefined && state.head !== expectedHead)
        throw new LedgerIntegrityError("External head mismatch");
      return state;
    });
  }
  /**
   * Atomically read, evaluate and append under one lock. Callbacks must be synchronous.
   * @example await ledger.transact(state => ({ events: [], value: state.head }))
   */
  async transact<T>(fn: (state: LedgerState) => { events: AuditEvent[]; value: T }): Promise<T> {
    return this.locked(async (path) => {
      const state = await this.load(path);
      const { events, value } = fn(structuredClone(state));
      fold([...state.events, ...events]);
      if (events.length) {
        let previous = state.head;
        const records = events.map((event, index) => {
          const payload = { sequence: state.events.length + index + 1, previous, event };
          const hash = digest(payload);
          previous = hash;
          return JSON.stringify({ ...payload, hash });
        });
        await durable(path, `${records.join("\n")}\n`, "a");
        const temp = `${path}.head.next`;
        await durable(temp, `${previous}\n`, "wx");
        await rename(temp, `${path}.head`);
        await syncDirectory(path);
      }
      return value;
    });
  }
}
