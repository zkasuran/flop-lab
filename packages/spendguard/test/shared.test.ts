// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SharedBudget } from "../src/shared";
import { FileLedger } from "../src/ledger";
import { guardedSpend } from "../src/guard";
import { parseFlop } from "../src/policy";
import { policy, request } from "./helpers";

let dir: string, ledger: FileLedger, shared: SharedBudget;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "shared-budget-"));
  ledger = new FileLedger(join(dir, "team.jsonl"), 20_000);
  shared = new SharedBudget(ledger, policy, () => request.at);
  await shared.initialize();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

it("reserves exact totals across parallel agents in independent processes", async () => {
  const module = new URL("../src/index.ts", import.meta.url).href;
  const results = await Promise.all(
    Array.from(
      { length: 6 },
      (_, agent) =>
        new Promise<{ allowed: number; denied: number }>((resolve, reject) => {
          const program = `import {SharedBudget,FileLedger} from ${JSON.stringify(module)};
      const budget = new SharedBudget(new FileLedger(${JSON.stringify(ledger.path)}, 20000), ${JSON.stringify(policy)}, () => ${request.at});
      const results = await Promise.all(Array.from({length:20}, (_,i) => budget.reserve('agent-${agent}', {...${JSON.stringify(request)}, id:String(i), amount:'0.25'})));
      console.log(JSON.stringify({allowed:results.filter(x=>x.decision==='allow').length,denied:results.filter(x=>x.decision==='deny').length}));`;
          const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", program], {
            stdio: ["ignore", "pipe", "pipe"],
          });
          let out = "",
            error = "";
          child.stdout.on("data", (data: Buffer) => {
            out += data.toString();
          });
          child.stderr.on("data", (data: Buffer) => {
            error += data.toString();
          });
          child.on("error", reject);
          child.on("exit", (code) => {
            if (code !== 0) reject(new Error(error));
            else {
              try {
                resolve(JSON.parse(out) as { allowed: number; denied: number });
              } catch (e) {
                reject(e);
              }
            }
          });
        }),
    ),
  );
  expect(results.reduce((n, r) => n + r.allowed, 0)).toBe(40);
  expect(results.reduce((n, r) => n + r.denied, 0)).toBe(80);
  const state = await ledger.verify();
  expect(state.reservations).toHaveLength(40);
  expect(state.reservations.reduce((n, r) => n + BigInt(r.charged), 0n)).toBe(parseFlop("10"));
  expect(state.reservations.every((r) => r.pending)).toBe(true);
  expect(new Set(state.reservations.map((r) => r.request.id)).size).toBe(40);
  expect(state.events.filter((e) => e.kind === "reserve").every((e) => e.agent?.startsWith("agent-"))).toBe(true);
  console.log(
    JSON.stringify({
      processes: 6,
      concurrentReservations: 120,
      allowed: 40,
      denied: 80,
      exactChargedRaw: state.reservations.reduce((n, r) => n + BigInt(r.charged), 0n).toString(),
    }),
  );
}, 30_000);

it("namespaces IDs and task ceilings by agent while preserving the shared total", async () => {
  expect((await shared.reserve("a", { ...request, amount: "6" })).decision).toBe("allow");
  expect((await shared.reserve("b", { ...request, amount: "4" })).decision).toBe("allow");
  expect((await shared.reserve("a", request)).fired).toContain("uniqueId");
  expect((await shared.reserve("c", request)).fired).toContain("budget.total");
});
it("rejects a changed policy and a legacy guard on the bound ledger", async () => {
  const changed = new SharedBudget(
    ledger,
    { ...policy, budgets: { ...policy.budgets, total: "100" } },
    () => request.at,
  );
  await expect(changed.reserve("a", request)).rejects.toThrow("policy mismatch");
  await expect(
    guardedSpend(
      { policy, ledger },
      request,
      { binding: {}, execute: async () => 0, channelId: () => null },
      { dryRun: false },
    ),
  ).rejects.toThrow("SharedBudget");
  expect((await ledger.verify()).reservations).toHaveLength(0);
});
it("fails closed on unbound ledgers and occupied locks", async () => {
  const empty = new FileLedger(join(dir, "empty"));
  await empty.initialize();
  await expect(new SharedBudget(empty, policy).reserve("a", request)).rejects.toThrow("binding");
  await writeFile(`${ledger.path}.lock`, "owned");
  await expect(new SharedBudget(new FileLedger(ledger.path, 1), policy).reserve("a", request)).rejects.toThrow(
    "locked",
  );
});
it("binds preflight to agent and content, consumes it and respects expiry", async () => {
  const other = new FileLedger(join(dir, "preflight"));
  let now = request.at;
  const budget = new SharedBudget(other, { ...policy, requireDryRun: true }, () => now);
  await budget.initialize();
  expect((await budget.reserve("a", { ...request, dryRun: true })).fired).toContain("requireDryRun");
  await budget.preview("a", request);
  expect((await other.verify()).reservations).toHaveLength(0);
  expect((await budget.reserve("b", request)).decision).toBe("deny");
  expect((await budget.reserve("a", { ...request, amount: "2" })).decision).toBe("deny");
  now += 120_001;
  expect((await budget.reserve("a", request)).decision).toBe("deny");
  await budget.preview("a", request);
  expect((await budget.reserve("a", request)).decision).toBe("allow");
  expect((await budget.reserve("a", request)).decision).toBe("deny");
  now--;
  await expect(budget.reserve("c", request)).rejects.toThrow("backwards");
});
