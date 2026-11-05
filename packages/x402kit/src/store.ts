// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, writeFile, rename, rmdir, open } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Quote } from "./protocol.js";
import { PaymentError, object, parseQuote, quoteHeaders, text } from "./protocol.js";

export interface SavedResponse {
  status: number;
  headers: [string, string][];
  body: string;
}
export interface Entry {
  quote: Quote;
  proof?: string;
  response?: SavedResponse;
}
export interface State {
  entries: Record<string, Entry>;
  used: Record<string, string>;
}
export interface ReplayStore {
  /** Serialize and durably save this mutation before returning. Callback must not do network I/O. */
  transaction<T>(change: (state: State) => T): Promise<T>;
}
const empty = (): State => ({
  entries: Object.create(null) as Record<string, Entry>,
  used: Object.create(null) as Record<string, string>,
});

/** Single-process replay store. Keep one instance per paywall. @example new MemoryStore() */
export class MemoryStore implements ReplayStore {
  private state = empty();
  private queue: Promise<unknown> = Promise.resolve();
  transaction<T>(change: (state: State) => T): Promise<T> {
    const work = this.queue.then(() => {
      const draft = structuredClone(this.state);
      const result = change(draft);
      this.state = draft;
      return structuredClone(result);
    });
    this.queue = work.catch(() => {});
    return work;
  }
}

function validate(value: unknown): State {
  const raw = object(value),
    state = empty();
  for (const [key, value] of Object.entries(object(raw.entries))) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("invalid_store_key");
    const entry = object(value),
      q = object(entry.quote);
    // Reuse the same boundary parser for persisted quotes.
    const quote = parseQuote(new Response(null, { headers: quoteHeaders(q as unknown as Quote) }));
    const parsed: Entry = { quote };
    if (entry.proof !== undefined) parsed.proof = text(entry.proof, 2048);
    if (entry.response !== undefined) {
      const r = object(entry.response);
      if (
        typeof r.status !== "number" ||
        r.status < 200 ||
        r.status > 599 ||
        !Number.isInteger(r.status) ||
        typeof r.body !== "string" ||
        r.body.length > 1400000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(r.body) ||
        !Array.isArray(r.headers)
      )
        throw new Error("invalid_saved_response");
      const headers: [string, string][] = r.headers.map((pair: unknown) => {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string")
          throw new Error("invalid_saved_headers");
        return [pair[0], pair[1]];
      });
      new Headers(headers);
      parsed.response = { status: r.status, body: r.body, headers };
    }
    state.entries[key] = parsed;
  }
  for (const [key, value] of Object.entries(object(raw.used))) state.used[text(key)] = text(value);
  return state;
}

/** Local-disk store with an exclusive directory lock and atomic rename. No stale-lock stealing. @example new FileStore("./payments.json") */
export class FileStore implements ReplayStore {
  private readonly file: string;
  constructor(file: string) {
    this.file = resolve(file);
  }
  async transaction<T>(change: (state: State) => T): Promise<T> {
    const lock = `${this.file}.lock`;
    let acquired = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        await mkdir(lock, { mode: 0o700 });
        acquired = true;
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    if (!acquired) throw new PaymentError("store_busy", 503);
    try {
      let state = empty();
      try {
        state = validate(JSON.parse(await readFile(this.file, "utf8")));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new PaymentError("store_corrupt", 503);
      }
      const result = change(state);
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: "wx", flush: true });
      await rename(temporary, this.file);
      const directory = await open(dirname(this.file), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
      return structuredClone(result);
    } finally {
      await rmdir(lock);
    }
  }
}
