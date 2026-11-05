// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileLedger } from "../src/ledger";
import { guardedSpend } from "../src/guard";
import { policy, request } from "./helpers";

let dir: string, ledger: FileLedger;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "spendguard-"));
  ledger = new FileLedger(join(dir, "ledger.jsonl"));
  await ledger.initialize();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("hash chain", () => {
  const add = () =>
    ledger.transact(() => ({
      events: [
        { kind: "dryRun", at: 1, fingerprint: "a".repeat(64) },
        { kind: "dryRun", at: 2, fingerprint: "b".repeat(64) },
      ],
      value: undefined,
    }));
  it("detects edits, middle deletion, reordering and trailing deletion", async () => {
    await add();
    const original = await readFile(ledger.path, "utf8"),
      lines = original.trimEnd().split("\n");
    for (const changed of [
      original.replace('"at":1', '"at":9'),
      `${lines[1]}\n`,
      `${lines[1]}\n${lines[0]}\n`,
      `${lines[0]}\n`,
      "",
    ]) {
      await writeFile(ledger.path, changed);
      await expect(ledger.verify()).rejects.toThrow();
    }
    await writeFile(ledger.path, original);
    expect((await ledger.verify()).events).toHaveLength(2);
  });
  it("detects a rewritten chain when an external head was saved", async () => {
    const pinned = (await ledger.verify()).head;
    await add();
    await expect(ledger.verify(pinned)).rejects.toThrow("External head mismatch");
  });
  it("fails closed on missing files, partial lines and stale locks", async () => {
    await writeFile(`${ledger.path}.lock`, "interrupted");
    await expect(new FileLedger(ledger.path, 1).verify()).rejects.toThrow("locked");
    await rm(`${ledger.path}.lock`);
    await writeFile(ledger.path, "{");
    await expect(ledger.verify()).rejects.toThrow("Incomplete");
    await rm(ledger.path);
    await expect(ledger.verify()).rejects.toThrow();
  });
  it("refuses symlinks and double initialization", async () => {
    await expect(ledger.initialize()).rejects.toThrow();
    await symlink(ledger.path, join(dir, "alias"));
    await expect(new FileLedger(join(dir, "alias")).verify()).rejects.toThrow();
  });
});

describe("atomic admission", () => {
  it("serializes independent Node processes through the same file lock", async () => {
    const moduleUrl = new URL("../src/ledger.ts", import.meta.url).href;
    const children = Array.from(
      { length: 4 },
      (_, i) =>
        new Promise<void>((resolve, reject) => {
          const program = `import { FileLedger } from ${JSON.stringify(moduleUrl)}; const l = new FileLedger(${JSON.stringify(ledger.path)}); await l.transact(s => ({ events: [{ kind: 'dryRun', at: (s.events.at(-1)?.at ?? 0) + 1, fingerprint: '${String(i).repeat(64)}' }], value: null }));`;
          const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", program], {
            stdio: ["ignore", "ignore", "pipe"],
          });
          let error = "";
          child.stderr.on("data", (part: Buffer) => {
            error += part.toString();
          });
          child.on("error", reject);
          child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(error))));
        }),
    );
    await Promise.all(children);
    expect((await ledger.verify()).events).toHaveLength(4);
  });
  it("serializes competing instances before executing at most the available budget", async () => {
    let executions = 0;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        guardedSpend(
          { policy, ledger: new FileLedger(ledger.path), now: () => request.at },
          { ...request, id: `r${i}`, amount: "6" },
          { binding: { operation: "test" }, execute: async () => ++executions, channelId: () => null },
          { dryRun: false },
        ),
      ),
    );
    expect(executions).toBe(1);
    expect(results.filter((r) => r.status === "denied")).toHaveLength(11);
    expect((await ledger.verify()).reservations).toHaveLength(1);
  });
  it("keeps a failed operation reserved and refuses replay", async () => {
    const options = { policy, ledger, now: () => request.at };
    const operation = {
      binding: {},
      execute: async () => {
        throw new Error("unknown chain outcome");
      },
      channelId: () => null,
    };
    expect((await guardedSpend(options, request, operation, { dryRun: false })).status).toBe("failed");
    expect((await ledger.verify()).reservations[0]?.charged).toBe("1000000000000000000");
    expect((await guardedSpend(options, request, operation, { dryRun: false })).status).toBe("denied");
  });
  it("dry-run authorization binds the policy and operation and expires", async () => {
    let now = request.at,
      executions = 0;
    const options = { policy: { ...policy, requireDryRun: true }, ledger, now: () => now };
    const operation = { binding: { prompt: "hello" }, execute: async () => ++executions, channelId: () => null };
    expect((await guardedSpend(options, request, operation, { dryRun: false })).status).toBe("denied");
    expect((await guardedSpend(options, request, operation, { dryRun: true })).status).toBe("dry-run");
    expect(executions).toBe(0);
    expect((await ledger.verify()).reservations).toHaveLength(0);
    expect(
      (await guardedSpend(options, request, { ...operation, binding: { prompt: "changed" } }, { dryRun: false }))
        .status,
    ).toBe("denied");
    now += 120_001;
    expect((await guardedSpend(options, request, operation, { dryRun: false })).status).toBe("denied");
    await guardedSpend(options, request, operation, { dryRun: true });
    expect((await guardedSpend(options, request, operation, { dryRun: false })).status).toBe("returned");
    expect(executions).toBe(1);
  });
  it("sends deny, threshold and tamper alerts without repeating a spend", async () => {
    const types: string[] = [];
    const options = {
      policy,
      ledger,
      now: () => request.at,
      notify: async (alert: { type: string }) => {
        types.push(alert.type);
        throw new Error("offline notifier");
      },
    };
    const operation = { binding: {}, execute: async () => 1, channelId: () => null };
    const result = await guardedSpend(options, { ...request, amount: "8" }, operation, { dryRun: false });
    expect(result.status).toBe("returned");
    expect(result.warnings).toHaveLength(4);
    await guardedSpend(options, { ...request, id: "other", amount: "8" }, operation, { dryRun: false });
    await writeFile(ledger.path, "");
    await expect(guardedSpend(options, request, operation, { dryRun: false })).rejects.toThrow();
    expect(types).toContain("budget80");
    expect(types).toContain("deny");
    expect(types).toContain("tampering");
  });
});
