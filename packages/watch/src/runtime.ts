// SPDX-License-Identifier: Apache-2.0
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { array, integer, object, parseConfig, text, time, type Config, type Output } from "./config";
import { evaluate, type Alert, type EngineState, type Memory } from "./engine";
import type { Sample } from "./observations";

type Delivery = { output: Output; attempts: number; nextAt: number; done: boolean };
type Pending = { alert: Alert; deliveries: Delivery[] };
export type DiskState = { version: 1; engine: EngineState; pending: Pending[] };
const empty = (): DiskState => ({ version: 1, engine: {}, pending: [] });

function parseAlert(v: unknown): Alert {
  const o = object(v),
    evidence = object(o.evidence);
  for (const value of Object.values(evidence))
    if (typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value)))
      throw new Error("Invalid alert evidence");
  const kind = text(o.kind) as Alert["kind"];
  if (
    !["devnet-reset", "settlement", "challenge-closing", "claim-change", "price-expired", "service-down"].includes(kind)
  )
    throw new Error("Invalid alert kind");
  return {
    id: text(o.id, 4000),
    rule: text(o.rule, 100),
    kind,
    measuredAt: time(o.measuredAt),
    source: text(o.source),
    message: text(o.message),
    evidence: evidence as Alert["evidence"],
  };
}
function parseState(v: unknown): DiskState {
  const o = object(v);
  if (o.version !== 1) throw new Error("Unsupported state version");
  const engine: EngineState = {};
  for (const [id, v] of Object.entries(object(o.engine))) {
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ["constructor", "prototype"].includes(id))
      throw new Error("Invalid state rule id");
    const m = object(v),
      values = object(m.values);
    for (const [k, value] of Object.entries(values)) {
      if (
        ["__proto__", "constructor", "prototype"].includes(k) ||
        (typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value)))
      )
        throw new Error("Invalid state value");
    }
    engine[id] = {
      signature: text(m.signature, 4000),
      lastAt: m.lastAt === null ? null : time(m.lastAt),
      values: values as Memory["values"],
      seen: array(m.seen).map((s) => text(s, 4000)),
    };
  }
  const pending = array(o.pending, 10_000).map((v): Pending => {
    const p = object(v);
    return {
      alert: parseAlert(p.alert),
      deliveries: array(p.deliveries, 4).map((v) => {
        const d = object(v);
        const output = parseConfig({
          version: 1,
          rules: [{ id: "validate", kind: "devnet-reset" }],
          outputs: [d.output],
        }).outputs[0]!;
        if (typeof d.done !== "boolean") throw new Error("Invalid delivery state");
        return { output, attempts: integer(d.attempts, 0, 3), nextAt: integer(d.nextAt), done: d.done };
      }),
    };
  });
  return { version: 1, engine, pending };
}

/** Read a bounded local input. @example await readBounded("watch.yaml", 64_000) */
export async function readBounded(path: string, max: number): Promise<string> {
  const file = await open(path, "r");
  try {
    if ((await file.stat()).size > max) throw new Error("File exceeds byte limit");
    const buffer = Buffer.alloc(max + 1),
      result = await file.read(buffer, 0, max + 1, 0);
    if (result.bytesRead > max) throw new Error("File exceeds byte limit");
    return buffer.subarray(0, result.bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
}
async function save(path: string, state: DiskState) {
  const raw = JSON.stringify(state);
  if (Buffer.byteLength(raw) > 16_000_000) throw new Error("State limit reached; archive before a new baseline");
  const tmp = `${path}.${process.pid}.tmp`,
    file = await open(tmp, "w", 0o600);
  try {
    await file.writeFile(raw);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(tmp, path);
  const dir = await open(dirname(path), "r");
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}

/** Stable receiver deduplication key for an at-least-once delivery. @example deliveryId(alert) */
export function deliveryId(alert: Alert): string {
  return createHash("sha256").update(alert.id).digest("hex");
}
/** Best-effort desktop integration without a shell. @example await notifyDesktop(alert) */
export async function notifyDesktop(alert: Alert): Promise<void> {
  const run = promisify(execFile);
  if (process.platform === "linux") await run("notify-send", ["--", "FLOP watch", alert.message], { timeout: 5000 });
  else if (process.platform === "darwin")
    await run("osascript", ["-e", `display notification ${JSON.stringify(alert.message)} with title "FLOP watch"`], {
      timeout: 5000,
    });
  else throw new Error("Desktop notifications unavailable on this platform");
}

export type RuntimeOptions = {
  fetch?: typeof fetch;
  now?: () => number;
  stdout?: (line: string) => Promise<void>;
  desktop?: (alert: Alert) => Promise<void>;
  deadLetter?: string;
};
/** Lock one state file for the process lifetime. Stale locks require operator inspection.
 * @example const watcher = await openWatcher("watch-state.json", config); try { await watcher.accept(sample); } finally { await watcher.close(); }
 */
export async function openWatcher(path: string, config: Config, options: RuntimeOptions = {}) {
  parseConfig(config);
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`,
    lock = await open(lockPath, "wx", 0o600);
  await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  let state = empty();
  try {
    state = parseState(JSON.parse(await readBounded(path, 16_000_000)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      await lock.close();
      await unlink(lockPath);
      throw error;
    }
  }
  const now = options.now ?? Date.now,
    fetcher = options.fetch ?? fetch;
  const stdout =
    options.stdout ??
    ((line: string) =>
      new Promise<void>((resolve, reject) =>
        process.stdout.write(`${line}\n`, (error) => (error ? reject(error) : resolve())),
      ));
  const deadLetter = options.deadLetter ?? `${path}.dead-letter.jsonl`;
  let closed = false,
    queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(() => {
      if (closed) throw new Error("Watcher closed");
      return fn();
    });
    queue = next.catch(() => undefined);
    return next;
  };
  async function drain() {
    const notes: string[] = [];
    for (const pending of state.pending)
      for (const d of pending.deliveries) {
        if (d.done || now() < d.nextAt) continue;
        let error: string | null = null,
          retry = false,
          wait = 1000 * 2 ** d.attempts;
        try {
          const alert = pending.alert;
          if (d.output.kind === "stdout")
            await stdout(
              `${alert.measuredAt} ${alert.rule}: ${alert.message} source=${alert.source} id=${deliveryId(alert)}`,
            );
          else if (d.output.kind === "jsonl") await stdout(JSON.stringify({ ...alert, deliveryId: deliveryId(alert) }));
          else if (d.output.kind === "desktop") await (options.desktop ?? notifyDesktop)(alert);
          else if (d.output.kind === "webhook") {
            const response = await fetcher(d.output.url, {
              method: "POST",
              redirect: "error",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": deliveryId(alert),
                "User-Agent": "flop-lab-watch/0.1",
              },
              body: JSON.stringify(alert),
              signal: AbortSignal.timeout(8000),
            });
            await response.body?.cancel();
            if (!response.ok) {
              error = `Webhook HTTP ${response.status}`;
              retry = response.status === 429 || response.status >= 500;
              const header = response.headers.get("retry-after");
              if (header) {
                const seconds = Number(header);
                const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now();
                if (Number.isFinite(delay)) wait = Math.max(wait, Math.min(3_600_000, delay));
              }
            }
          }
        } catch (e) {
          error = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
          retry = d.output.kind === "webhook";
        }
        d.attempts++;
        if (!error) d.done = true;
        else if (retry && d.attempts < 3) {
          d.nextAt = now() + wait;
          notes.push(`${pending.alert.rule}: retry scheduled at ${new Date(d.nextAt).toISOString()}`);
        } else {
          // Append before acknowledgement. A crash can duplicate a dead letter; its stable ID is retained.
          await mkdir(dirname(deadLetter), { recursive: true });
          const file = await open(deadLetter, "a", 0o600);
          try {
            await file.writeFile(
              `${JSON.stringify({ alert: pending.alert, deliveryId: deliveryId(pending.alert), output: d.output, attempts: d.attempts, failedAt: new Date(now()).toISOString(), error })}\n`,
            );
            await file.sync();
          } finally {
            await file.close();
          }
          d.done = true;
          notes.push(`${pending.alert.rule}: delivery failed; saved to ${deadLetter}`);
        }
        await save(path, state);
      }
    state.pending = state.pending.filter((p) => p.deliveries.some((d) => !d.done));
    await save(path, state);
    return { pending: state.pending.length, notes };
  }
  return {
    accept(sample: Sample) {
      return serial(async () => {
        const result = evaluate(config, sample, state.engine);
        if (state.pending.length + result.alerts.length > 10_000)
          throw new Error("Outbox full; drain deliveries before polling");
        state.engine = result.state;
        state.pending.push(
          ...result.alerts.map((alert) => ({
            alert,
            deliveries: config.outputs.map((output) => ({ output, attempts: 0, nextAt: 0, done: false })),
          })),
        );
        await save(path, state);
        return { alerts: result.alerts, notes: result.notes };
      });
    },
    flush() {
      return serial(drain);
    },
    async close() {
      await queue;
      if (!closed) {
        closed = true;
        await lock.close();
        await unlink(lockPath);
      }
    },
  };
}
