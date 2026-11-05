// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import type * as Chain from "@flop-labs/sdk";
import type * as Gateway from "@flop-labs/client";
import { ScriptedService, endpoints } from "./mock.ts";
import type { Step } from "./mock.ts";
import type { Trace } from "./model.ts";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const prompt: Gateway.NonStreamingChatCompletionRequest = {
  model: "fixture",
  messages: [{ role: "user", content: "offline fixture" }],
};
const refusal = (status: number): Step => ({
  status,
  body: '{"error":"synthetic refusal"}',
  headers: { "retry-after": "120" },
});
const challenge: Step = {
  status: 402,
  body: "payment needed",
  headers: {
    "x-payment-price": "1",
    "x-payment-hash-lock": "0x" + "11".repeat(32),
    "x-payment-timeout-blocks": "10",
    "x-payment-destination": "synthetic-destination",
  },
};
const describe = (value: unknown) =>
  value instanceof Error ? `${value.name}: ${value.message}` : JSON.stringify(value);
async function outcome(run: () => Promise<unknown>) {
  try {
    return { value: await run(), error: undefined };
  } catch (error) {
    return { value: undefined, error };
  }
}
export interface Observation {
  passed: boolean;
  observed: string;
  trace: Trace[];
}

/** Execute an approved scenario inside the isolated worker. @example exercise("client-empty", modules) */
export async function exercise(
  id: string,
  modules: { sdk?: typeof Chain; client?: typeof Gateway },
): Promise<Observation> {
  let service = new ScriptedService([{ body: "{}" }]);
  const use = (steps: Step[], repeat = false) => {
    service = new ScriptedService(steps, repeat);
    globalThis.fetch = service.fetch;
  };
  const result = (passed: boolean, observed: unknown): Observation => ({
    passed,
    observed: describe(observed),
    trace: service.trace,
  });
  if (id.startsWith("client-")) {
    const { FlopClient, FlopHTTPError, FlopValidationError, FlopTransportError } = modules.client!;
    const client = () =>
      new FlopClient({ baseURL: endpoints.gateway, apiKey: "synthetic-test-key", fetch: service.fetch });
    if (id === "client-models" || id === "client-empty") {
      const fixture: unknown = JSON.parse(await readFile(new URL("../fixtures/models.json", import.meta.url), "utf8"));
      if (!fixture || typeof fixture !== "object" || !("raw" in fixture) || typeof fixture.raw !== "string")
        throw new Error("Invalid model recording");
      const body = id === "client-empty" ? '{"data":[],"total_count":0,"links":{"next":null}}' : fixture.raw;
      use([{ body }]);
      const models = await client().listModels();
      return result(
        JSON.stringify(models) === JSON.stringify(JSON.parse(body)) && !service.trace[0]?.headers.authorization,
        {
          rows: models.data.length,
          source: id === "client-empty" ? "synthetic empty feed" : "fixtures/models.json",
          authorizationSent: !!service.trace[0]?.headers.authorization,
        },
      );
    }
    if (id === "client-malformed" || id === "client-shape") {
      use([{ body: id === "client-malformed" ? "{" : '{"data":[{"id":42}],"total_count":1,"links":{"next":null}}' }]);
      const r = await outcome(() => client().listModels());
      return result(r.error instanceof FlopValidationError && service.trace.length === 1, describe(r.error));
    }
    if (id === "client-input") {
      use([refusal(400)]);
      // Deliberately cross the runtime boundary with a value TypeScript would reject.
      const r = await outcome(() =>
        client().createChatCompletion({
          model: "fixture",
          messages: [],
        } as unknown as Gateway.NonStreamingChatCompletionRequest),
      );
      return result(r.error instanceof FlopValidationError && service.trace.length === 0, describe(r.error));
    }
    if (id === "client-invalid-keys") {
      use([refusal(400)], true);
      const observed = [];
      for (const key of ["", "a b", "\n", "x".repeat(129)]) {
        const r = await outcome(() => client().createChatCompletion(prompt, { idempotencyKey: key }));
        observed.push(r.error instanceof FlopValidationError);
      }
      return result(observed.every(Boolean) && service.trace.length === 0, {
        rejected: observed,
        requests: service.trace.length,
      });
    }
    if (id === "client-timeout" || id === "client-slow-body") {
      use([id === "client-timeout" ? { fault: "timeout" } : { bodyDelayMs: 1000 }]);
      const controller = new AbortController();
      const reason = new Error("synthetic caller cancellation");
      const timer = setTimeout(() => controller.abort(reason), 15);
      try {
        const r = await outcome(() => client().createChatCompletion(prompt, { signal: controller.signal }));
        return result(r.error === reason && service.trace.length === 1, {
          sameReason: r.error === reason,
          error: describe(r.error),
        });
      } finally {
        clearTimeout(timer);
      }
    }
    if (id === "client-disconnect") {
      use([{ fault: "disconnect" }], true);
      const r = await outcome(() => client().createChatCompletion(prompt));
      return result(r.error instanceof FlopTransportError && service.trace.length === 1, describe(r.error));
    }
    const status = id === "client-idempotency" ? 429 : Number(id.split("-").at(-1));
    use([refusal(status)], true);
    const r = await outcome(() =>
      client().createChatCompletion(prompt, id === "client-idempotency" ? { idempotencyKey: "fixture-replay" } : {}),
    );
    const retained =
      r.error instanceof FlopHTTPError &&
      r.error.status === status &&
      r.error.retryAfter === "120" &&
      JSON.stringify(r.error.body) === '{"error":"synthetic refusal"}';
    const keyOK = id !== "client-idempotency" || service.trace[0]?.headers["idempotency-key"] === "fixture-replay";
    return result(retained && keyOK && service.trace.length === 1, {
      requests: service.trace.length,
      retained,
      keyOK,
      error: describe(r.error),
    });
  }
  if (id.startsWith("sdk-faucet")) {
    const chain = modules.sdk!;
    const config = { endpoint: endpoints.faucet, maxRetries: 3, retryDelay: 1, timeout: 15 };
    const recovery = id === "sdk-faucet-recovery";
    const timeout = id === "sdk-faucet-timeout";
    const control = id === "sdk-faucet-control";
    const status = control ? 429 : Number(id.split("-").at(-1));
    use(
      timeout
        ? [{ fault: "timeout" }]
        : recovery
          ? [refusal(503), { body: '{"amount":1,"txHash":"synthetic"}' }]
          : [refusal(status)],
      !recovery,
    );
    const r = control
      ? await chain.requestFaucetFunding("synthetic-address", config)
      : await new chain.FaucetClient(config).fund("synthetic-address", 1);
    const passed = recovery
      ? r.success && service.trace.length === 2
      : timeout
        ? !r.success && service.trace.length === 3
        : !r.success && r.status === status && r.retryAfterSeconds === 120 && service.trace.length === 1;
    return result(passed, { requests: service.trace.length, result: r });
  }
  if (id === "sdk-x402-post") {
    use([refusal(403)], true);
    const c = new modules.sdk!.X402Client({
      gatewayUrl: endpoints.gateway,
      retry: { maxAttempts: 3, backoffMs: 1, maxBackoffMs: 1 },
    });
    const r = await outcome(() => c.depositToChannel("synthetic", 1));
    return result(r.error !== undefined && service.trace.length === 1, {
      requests: service.trace.length,
      returned: r.value,
      error: describe(r.error),
    });
  }
  if (id === "sdk-x402-function" || id === "sdk-x402-class") {
    use([challenge, { status: 200, body: "ok" }, { status: 200, body: "ok" }]);
    // Return 402 for every unpaid request. The SDK alone decides when to attach proof.
    const transport = service.fetch;
    let payments = 0;
    globalThis.fetch = async (input, init) => {
      const res = await transport(input, init);
      return new Headers(init?.headers).has("x-payment-proof")
        ? res
        : new Response(challenge.body, { status: 402, headers: challenge.headers });
    };
    // Only these two methods are used by the payment adapter. No real chain client exists.
    const payer = {
      createHtlc: async () => {
        payments++;
        return { htlcId: "synthetic", txHash: "synthetic" };
      },
      waitForSettlement: async () => ({ status: "SETTLED" }),
    } as unknown as Chain.FlopClient;
    const c = modules.sdk!;
    const opts = { method: "POST", body: '{"prompt":"offline"}' };
    const res =
      id === "sdk-x402-function"
        ? await c.x402Fetch(payer, endpoints.gateway, opts)
        : await new c.X402Client({ gatewayUrl: endpoints.gateway, flopClient: payer }).fetch(endpoints.gateway, opts);
    for (const t of service.trace) {
      if (!t.headers["x-payment-proof"]) {
        t.status = 402;
        t.responseHeaders = challenge.headers!;
      }
    }
    const unpaid = service.trace.filter((t) => !t.headers["x-payment-proof"]).length;
    return result(res.status === 200 && payments === 1 && unpaid === 1 && service.trace.length === 2, {
      status: res.status,
      unpaid,
      mockPayments: payments,
      requests: service.trace.length,
    });
  }
  if (id === "sdk-header-example") {
    const response = new Response(challenge.body, { status: 402, headers: challenge.headers });
    // Intentionally use the README argument, which conflicts with the declaration.
    const r = await outcome(async () => modules.sdk!.parsePaymentHeaders(response.headers as unknown as Response));
    return result(r.error === undefined && r.value !== null, { value: r.value, error: describe(r.error) });
  }
  if (id.startsWith("sdk-capacity")) {
    const c = modules.sdk!;
    // Minimal read-only API. The real SDK runs but a transaction accessor always rejects.
    const api = {
      derive: { chain: { bestNumber: async () => ({ toNumber: () => 1 }) } },
      get tx() {
        throw new Error("No chain writes in conformance");
      },
    } as unknown as ConstructorParameters<typeof c.AgentOrchestrator>[0];
    const signer = { address: "synthetic" } as ConstructorParameters<typeof c.AgentOrchestrator>[1];
    const observed = [];
    for (const strategy of ["round_robin", "least_loaded", "random", "capability_based"] as const) {
      const o = new c.AgentOrchestrator(api, signer, {
        orchestratorId: "fixture",
        maxTasksPerWorker: 1,
        taskTimeout: 10,
        autoRetry: false,
        maxRetries: 0,
        loadBalancing: strategy,
      });
      const task = {
        agent: "synthetic",
        gflops: 1,
        maxLatencyBlocks: 10,
        model: "fixture",
        paymentFlop: 0n,
        prompt: "offline",
        teeRequirements: { minVersion: "v1" },
      };
      const empty = await outcome(() => o.delegateTask(task));
      await o.registerWorker({
        agentId: "worker",
        address: "synthetic",
        role: "worker",
        status: "active",
        workload: id === "sdk-capacity" ? 1 : 0,
        capabilities: ["v1"],
        sessionExpires: 100,
      });
      const r = await outcome(() => o.delegateTask(task));
      const assignments = o.getStats().totalAssignments;
      observed.push({
        strategy,
        assignments,
        passed:
          id === "sdk-capacity"
            ? r.error instanceof Error && assignments === 0
            : r.error === undefined && assignments === 1 && empty.error instanceof Error,
      });
    }
    return result(
      observed.every((r) => r.passed),
      observed,
    );
  }
  if (id === "sdk-wallet-report") {
    const c = modules.sdk!;
    const calls: string[] = [];
    const reject = (step: string) => {
      calls.push(step);
      throw new Error(`synthetic ${step} refusal`);
    };
    // Stub pallet calls fail before a signer can be used. No transaction is constructed.
    const api = {
      tx: {
        agentWallet: { createWallet: () => reject("createWallet") },
        flopSessionKeys: { createSession: () => reject("createSession") },
      },
    } as unknown as Parameters<typeof c.setupWorkerAgent>[0];
    const r = await c.setupWorkerAgent(api, { address: "synthetic" } as Parameters<typeof c.setupWorkerAgent>[1], {
      agentId: "fixture",
      agentAddress: "synthetic",
      perTxLimit: 1n,
      dailyCap: 1n,
      sessionSpendingCap: 1n,
      sessionDuration: 10,
    });
    return result(!r.walletCreated && !r.sessionCreated && r.txHashes.length === 0, { calls, result: r });
  }
  if (id === "cli-version" || id === "cli-help") {
    const entry = require.resolve("@flop-labs/cli/dist/cli.js");
    const { stdout, stderr } = await exec(process.execPath, [entry, id === "cli-version" ? "--version" : "--help"], {
      timeout: 10000,
      maxBuffer: 100000,
      env: { PATH: process.env.PATH, HOME: "/nonexistent-sdkconf-home", NO_COLOR: "1" },
    });
    const passed =
      id === "cli-version"
        ? stdout.trim() === "0.4.0"
        : ["--network", "--rpc", "--json"].every((flag) => stdout.includes(flag));
    return result(passed, {
      stdout:
        id === "cli-help"
          ? stdout.split("\n").filter((line) => ["--network", "--rpc", "--json"].some((flag) => line.includes(flag)))
          : stdout.trim(),
      stderr,
    });
  }
  throw new Error(`Unknown exercise: ${id}`);
}
