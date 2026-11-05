// SPDX-License-Identifier: Apache-2.0
import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { catalogue } from "./catalogue.ts";
import { classify, versions } from "./model.ts";
import type { Attempt, Report, Result, Sdk } from "./model.ts";
import { exercise } from "./exercises.ts";

const options = workerData as { sdk?: Sdk; scenario?: string; python?: string };
const started = performance.now();
const measuredAt = new Date().toISOString();
// AbortSignal.timeout uses an unref timer. Keep the worker alive until its report.
const keepAlive = setInterval(() => undefined, 1000);
const modules: Parameters<typeof exercise>[1] = {};
const unavailable = new Map<string, string>();
const results: Result[] = [];
const require = createRequire(import.meta.url);
// This worker owns these globals. The caller's fetch and console stay untouched.
globalThis.fetch = async () => {
  throw new Error("Unscripted network access blocked");
};
console.log = () => undefined;
console.warn = () => undefined;
for (const sdk of ["sdk", "client", "cli"] as const) {
  if (options.sdk && options.sdk !== sdk) continue;
  try {
    const entry =
      sdk === "cli"
        ? require.resolve("@flop-labs/cli/package.json")
        : new URL("../package.json", import.meta.resolve(`@flop-labs/${sdk}`));
    const manifest: unknown = JSON.parse(await readFile(entry, "utf8"));
    if (!manifest || typeof manifest !== "object" || !("version" in manifest) || manifest.version !== versions[sdk])
      throw new Error(`Expected exact ${versions[sdk]}`);
    if (sdk === "sdk") modules.sdk = await import("@flop-labs/sdk");
    if (sdk === "client") modules.client = await import("@flop-labs/client");
  } catch (error) {
    unavailable.set(sdk, `Pinned package unavailable: ${String(error)}`);
  }
}
for (const spec of catalogue.filter(
  (s) => (!options.sdk || s.sdk === options.sdk) && (!options.scenario || s.id === options.scenario),
)) {
  let skipped = unavailable.get(spec.sdk);
  if (spec.id === "cli-wallet" || spec.id === "sdk-mcp") skipped = spec.expected;
  const attempts: Attempt[] = [];
  if (!skipped) {
    for (let repeat = 0; repeat < 2; repeat++) {
      const at = new Date().toISOString();
      const start = performance.now();
      try {
        let observation;
        if (spec.sdk === "python") {
          const { stdout } = await promisify(execFile)(
            options.python ?? "python3",
            [fileURLToPath(new URL("../python/probe.py", import.meta.url))],
            {
              timeout: 10000,
              maxBuffer: 20000,
              env: { PATH: process.env.PATH, HOME: "/nonexistent-sdkconf-home", LANGFUSE_ENABLED: "false" },
            },
          );
          const p: unknown = JSON.parse(stdout);
          if (
            !p ||
            typeof p !== "object" ||
            !("passed" in p) ||
            typeof p.passed !== "boolean" ||
            !("trace" in p) ||
            !Array.isArray(p.trace) ||
            !("observed" in p) ||
            typeof p.observed !== "string"
          )
            throw new Error("Invalid Python probe result");
          observation = p as Awaited<ReturnType<typeof exercise>>;
        } else observation = await exercise(spec.id, modules);
        attempts.push({
          measuredAt: at,
          durationMs: Math.round((performance.now() - start) * 100) / 100,
          ...observation,
        });
        if (observation.passed) break;
      } catch (error) {
        // Infrastructure failure cannot become evidence of SDK nonconformance.
        skipped = `Exercise unavailable: ${error instanceof Error ? error.message : String(error)}`;
        attempts.length = 0;
        break;
      }
    }
  }
  const status = classify(attempts.map((a) => a.passed));
  results.push({
    ...spec,
    attempts,
    status,
    reason:
      skipped ??
      (status === "FAIL"
        ? "The expectation failed on two fresh scenario instances."
        : status === "PASS"
          ? "The observed outcome matches this check."
          : "Attempts disagree; no stable verdict."),
  });
}
const report: Report = {
  schema: "flop-sdkconf/v1",
  measuredAt,
  runtime: process.version,
  source: "Pinned npm artifacts in an isolated worker; scripted Fetch transport and synthetic chain stubs",
  durationMs: Math.round((performance.now() - started) * 100) / 100,
  networkRequests: 0,
  results,
};
parentPort?.postMessage(report);
clearInterval(keepAlive);
